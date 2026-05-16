import type { RebangHotItem, RebangTab } from "@/lib/rebang/types";
import {
  fetchHotItems,
  fetchMenuTabs,
} from "@/lib/rebang/api";
import { getEmbedding } from "./embedding";
import { fallbackKeywords, normalizeText } from "./text";
import {
  findInterestByUrl,
  readEmbeddingCache,
  readInterests,
  upsertInterest,
} from "@/lib/server-data/interest-store";
import {
  readHotPool,
  upsertHotPool,
  type HotPoolUpsertInput,
} from "@/lib/server-data/hot-pool-store";
import {
  readLatestRecommendations,
  saveRun,
  type RecommendationRecord,
  type RecommendationRun,
  type RunTrigger,
} from "@/lib/server-data/recommendation-store";
import {
  bumpExposures,
  markPositiveFeedback,
} from "@/lib/server-data/exposure-store";
import type { InterestItem, InterestKind, UserProfile } from "@/types";
import { nanoid } from "nanoid";
import { ensureUserProfile } from "./profile-generator";
import { recallCandidates } from "./recall";
import { rankCandidates } from "./ranking";
import { applyRerank } from "./reranking";

export interface HotCandidateInput extends RebangHotItem {
  source?: string;
}

type RecommendationSource = {
  key: "zhihu" | "weibo";
  label: string;
  subTab?: string;
};

const RECOMMENDATION_SOURCES: RecommendationSource[] = [
  { key: "zhihu", label: "知乎" },
  { key: "weibo", label: "微博" },
];

const MAX_SOURCE_PAGES = 20;
const POOL_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 1000;
const RECOMMENDATION_HARD_CAP = 80;
const MIN_FINAL_SCORE = 0.35;

function itemText(item: HotCandidateInput) {
  return normalizeText(item.title, item.describe, item.source, item.heat_str);
}

function heatScore(heat?: string) {
  if (!heat) return 0;
  const match = heat.replace(/,/g, "").match(/([\d.]+)/);
  if (!match) return 0;
  const raw = Number(match[1]);
  const multiplier = heat.includes("万") ? 10000 : 1;
  return Math.min(1, Math.log10(raw * multiplier + 1) / 7);
}

function signedWeight(interest: InterestItem) {
  const days =
    (Date.now() - new Date(interest.updatedAt).getTime()) / 86400000;
  const halfLifeDays = interest.kind === "negative" ? 240 : 180;
  const decay = Math.pow(0.5, Math.max(0, days) / halfLifeDays);
  const magnitude = Math.max(0.1, Math.min(10, Math.abs(interest.weight)));
  const sign = interest.kind === "negative" ? -1 : 1;
  const kindBoost = interest.kind === "read_later" ? 0.65 : 1;
  return sign * magnitude * kindBoost * decay;
}

function dedupeCandidates(items: HotCandidateInput[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.www_url || item.item_key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceSubTabs(source: RecommendationSource, tabMeta: RebangTab | null) {
  if (source.subTab) return [source.subTab];
  const children = tabMeta?.child ?? [];
  if (children.length > 0) return children.map((child) => child.key);
  return [undefined];
}

interface FetchedCandidate extends HotCandidateInput {
  sourceKey: string;
  subTab?: string;
}

async function fetchFreshCandidates(): Promise<FetchedCandidate[]> {
  const { homeTabs } = await fetchMenuTabs();
  const tabMap = new Map<string, RebangTab>(
    homeTabs.map((tab) => [tab.key, tab])
  );
  const batches: FetchedCandidate[] = [];

  for (const source of RECOMMENDATION_SOURCES) {
    const tabMeta = tabMap.get(source.key) ?? null;
    for (const subTab of sourceSubTabs(source, tabMeta)) {
      for (let page = 1; page <= MAX_SOURCE_PAGES; page += 1) {
        try {
          const data = await fetchHotItems(source.key, {
            page,
            subTab,
            tabMeta,
          });
          if (!data.list.length) break;
          batches.push(
            ...data.list.map((item) => ({
              ...item,
              item_key: `${source.key}:${subTab ?? "default"}:${page}:${item.item_key}`,
              source: source.label,
              sourceKey: source.key,
              subTab,
            }))
          );
          if (data.current_page >= data.total_page) break;
        } catch {
          // 部分平台或分页偶发不可用，推荐候选池直接跳过，避免污染 PM2 error 日志。
          break;
        }
      }
    }
  }

  return dedupeCandidates(batches) as FetchedCandidate[];
}

export async function refreshHotPool(): Promise<{
  inserted: number;
  updated: number;
  total: number;
  fetched: number;
}> {
  const fresh = await fetchFreshCandidates();
  const inputs: HotPoolUpsertInput[] = fresh
    .filter((item) => Boolean(item.www_url))
    .map((item) => ({
      url: item.www_url,
      itemKey: item.item_key,
      title: item.title,
      describe: item.describe,
      heatStr: item.heat_str,
      source: item.source,
      sourceKey: item.sourceKey,
      subTab: item.subTab,
      raw: item,
    }));
  const stats = upsertHotPool(inputs);
  return { ...stats, fetched: fresh.length };
}

export function getHotPoolCandidates(): HotCandidateInput[] {
  const pool = readHotPool();
  return pool.map((entry) => ({
    ...entry,
    item_key: entry.www_url || entry.item_key,
  }));
}

/**
 * 兼容老调用：直接抓取一份新数据并合入候选池后，返回当前池内全部候选。
 */
export async function collectFocusedHotCandidates(): Promise<HotCandidateInput[]> {
  await refreshHotPool();
  return getHotPoolCandidates();
}

/* ============================================================
 * 兴趣反馈写入
 *  - 创建/合并 interest 记录
 *  - 同步给 embedding 缓存写入
 *  - 正向反馈 (positive / read_later) 时标记曝光为 "已正反馈"，避免疲劳惩罚
 * ============================================================ */
export async function addInterestFeedback(
  item: HotCandidateInput,
  kind: InterestKind
) {
  const now = new Date().toISOString();
  const text = itemText(item);
  const { key, embedding } = await getEmbedding(text);
  const existing = item.www_url ? await findInterestByUrl(item.www_url) : null;
  const delta = kind === "positive" ? 1 : kind === "read_later" ? 0.55 : 1.25;
  const sign = kind === "negative" ? -1 : 1;

  const next: InterestItem = existing
    ? {
        ...existing,
        kind,
        weight:
          sign *
          Math.min(10, Math.max(0, Math.abs(existing.weight)) + delta),
        keywords: fallbackKeywords(text),
        embeddingKey: key,
        updatedAt: now,
      }
    : {
        id: nanoid(),
        kind,
        title: item.title,
        url: item.www_url,
        source: item.source,
        heat: item.heat_str,
        keywords: fallbackKeywords(text),
        embeddingKey: key,
        weight: sign * delta,
        createdAt: now,
        updatedAt: now,
      };

  await upsertInterest(next);
  // 正向反馈：标记曝光，避免再次推送时被疲劳惩罚衰减
  if (item.www_url && (kind === "positive" || kind === "read_later")) {
    markPositiveFeedback(item.www_url);
  }
  return { key, embedding };
}

/* ============================================================
 * 推荐管线（多通道召回 + LLM 多维精排 + MMR 重排）
 *
 * 步骤：
 *   1. ensureUserProfile  → 取得（或重新生成）结构化用户画像
 *   2. recallCandidates   → 从候选池五通道并行召回
 *   3. rankCandidates     → LLM 多维精排（domain/style/novelty/quality）
 *   4. applyRerank        → MMR + 探索注入 + 同源约束
 *
 * 输出 RecommendOutcome 形态保持稳定，便于上层 saveRun。
 * ============================================================ */

interface PipelineOutcome {
  records: Array<{
    itemKey: string;
    url?: string;
    score: number;
    baseScore: number;
    llmScore?: number;
    reason: string;
    matchedInterests: string[];
    featureScores: import("@/types").FeatureScores;
    recallChannels: import("@/types").RecallChannel[];
    exploration: boolean;
    item: HotCandidateInput;
  }>;
  profile: UserProfile;
  configured: boolean;
  candidateCount: number;
}

async function runRecommendationPipeline(
  candidates: HotCandidateInput[],
  options: { forceRegenerateProfile?: boolean }
): Promise<PipelineOutcome> {
  const profile = await ensureUserProfile(
    options.forceRegenerateProfile ?? false
  );
  const interests = await readInterests();
  const embeddingCache = await readEmbeddingCache();
  const embeddingByKey = new Map<string, number[]>();
  for (const [key, vec] of Object.entries(embeddingCache)) {
    embeddingByKey.set(key, vec);
  }

  const evidence = await recallCandidates(
    profile,
    candidates,
    interests,
    embeddingByKey
  );

  const ranked = await rankCandidates(profile, evidence, {
    llmEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
  });

  const reranked = await applyRerank(ranked, {
    capacity: RECOMMENDATION_HARD_CAP,
    lambda: 0.72,
    minExploration: 2,
  });

  const records: PipelineOutcome["records"] = reranked
    .filter((r) => r.finalScore >= MIN_FINAL_SCORE)
    .map((r) => ({
      itemKey: r.evidence.candidate.item_key,
      url: r.evidence.candidate.www_url,
      score: Number(r.finalScore.toFixed(4)),
      baseScore: Number(r.features.baseScore.toFixed(4)),
      llmScore: Number(r.features.llmOverall.toFixed(4)),
      reason: r.reason,
      matchedInterests: r.evidence.positiveMatches
        .slice(0, 3)
        .map((m) => m.interest.title),
      featureScores: r.features,
      recallChannels: Array.from(r.evidence.channels),
      exploration: r.evidence.channels.has("exploration"),
      item: r.evidence.candidate,
    }));

  return {
    records,
    profile,
    configured: Boolean(process.env.SILICONFLOW_API_KEY),
    candidateCount: candidates.length,
  };
}

/* ============================================================
 * 推荐编排：候选池新鲜度判断、运行结果持久化、冷却保护
 * ============================================================ */

export interface RunOptions {
  trigger: RunTrigger;
  forceRefreshPool?: boolean;
  forceRecompute?: boolean;
}

export interface RunSnapshot {
  run: RecommendationRun;
  records: RecommendationRecord[];
  pool: { total: number };
}

export function readLatestRunSnapshot(): RunSnapshot | null {
  const { run, records } = readLatestRecommendations();
  if (!run) return null;
  const pool = readHotPool();
  return { run, records, pool: { total: pool.length } };
}

export function isRunStale(run: RecommendationRun | null): boolean {
  if (!run) return true;
  return Date.now() - new Date(run.generatedAt).getTime() >
    POOL_REFRESH_INTERVAL_MS;
}

export function isWithinManualCooldown(
  run: RecommendationRun | null
): boolean {
  if (!run) return false;
  return Date.now() - new Date(run.generatedAt).getTime() < MANUAL_COOLDOWN_MS;
}

async function ensurePoolReady(forceRefresh: boolean) {
  if (forceRefresh) {
    return refreshHotPool();
  }
  const pool = readHotPool();
  if (pool.length === 0) {
    return refreshHotPool();
  }
  return null;
}

export async function runHotRecommendation(
  options: RunOptions
): Promise<RunSnapshot> {
  const startedAt = Date.now();
  await ensurePoolReady(options.forceRefreshPool ?? false);
  const candidates = getHotPoolCandidates();
  const result = await runRecommendationPipeline(candidates, {
    forceRegenerateProfile: options.forceRecompute === true,
  });
  const generatedAt = new Date().toISOString();
  const run = saveRun({
    generatedAt,
    durationMs: Date.now() - startedAt,
    candidateCount: result.candidateCount,
    trigger: options.trigger,
    profile: result.profile,
    configured: result.configured,
    items: result.records.map((rec) => ({
      itemKey: rec.itemKey,
      url: rec.url,
      score: rec.score,
      reason: rec.reason,
      matchedInterests: rec.matchedInterests,
      baseScore: rec.baseScore,
      llmScore: rec.llmScore,
      featureScores: rec.featureScores,
      recallChannels: rec.recallChannels,
      exploration: rec.exploration,
      item: rec.item,
    })),
  });
  // 推荐曝光埋点
  const urls = result.records
    .map((r) => r.url)
    .filter((u): u is string => Boolean(u));
  bumpExposures(urls, generatedAt);
  const records = readLatestRecommendations().records;
  const pool = readHotPool();
  return { run, records, pool: { total: pool.length } };
}
