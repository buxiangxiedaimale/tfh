import type { RebangHotItem, RebangTab } from "@/lib/rebang/types";
import {
  fetchHotItems,
  fetchMenuTabs,
} from "@/lib/rebang/api";
import { rerankWithDeepSeek, type RerankCandidate } from "./deepseek-rerank";
import { getEmbedding } from "./embedding";
import { clampScore, cosineSimilarity } from "./similarity";
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
  type HotPoolEntry,
  type HotPoolUpsertInput,
} from "@/lib/server-data/hot-pool-store";
import {
  readLatestRecommendations,
  saveRun,
  type RecommendationRun,
  type RecommendationRecord,
  type RunTrigger,
} from "@/lib/server-data/recommendation-store";
import type {
  HotRecommendation,
  InterestItem,
  InterestKind,
  InterestProfile,
} from "@/types";
import { nanoid } from "nanoid";

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
const MAX_SCANNED_ITEMS = 1500;
const LLM_RERANK_LIMIT = 50;
const RECOMMENDATION_HARD_CAP = 100;
const LLM_WEIGHT = 0.4;
const MIN_RECOMMENDATION_SCORE = 0.46;
const MIN_MATCH_SIMILARITY = 0.5;
const STRONG_MATCH_SIMILARITY = 0.62;
const STRONG_NEGATIVE_SIMILARITY = 0.6;
const SEMANTIC_FLOOR = 0.42;
const POOL_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 1000;

type ScoredMatch = {
  interest: InterestItem;
  similarity: number;
  score: number;
};

type InterestSignal = {
  item: InterestItem;
  embedding: number[];
  weight: number;
};

type InterestModel = {
  positives: InterestSignal[];
  negatives: InterestSignal[];
  positiveKeywords: Map<string, number>;
  negativeKeywords: Map<string, number>;
  sourcePreference: Map<string, number>;
};

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

export function buildInterestProfile(interests: InterestItem[]): InterestProfile {
  const keywordMap = new Map<
    string,
    { score: number; examples: Set<string>; keywords: Set<string> }
  >();
  const positiveKinds = new Set<InterestKind>(["positive", "read_later"]);

  for (const item of interests) {
    if (!positiveKinds.has(item.kind)) continue;
    const weight = Math.max(0.05, signedWeight(item));
    const keys = item.keywords.length ? item.keywords : fallbackKeywords(item.title);
    for (const keyword of keys.slice(0, 6)) {
      const normalized = keyword.trim();
      if (!normalized) continue;
      const group = keywordMap.get(normalized) ?? {
        score: 0,
        examples: new Set<string>(),
        keywords: new Set<string>(),
      };
      group.score += weight;
      group.examples.add(item.title);
      group.keywords.add(normalized);
      keywordMap.set(normalized, group);
    }
  }

  const clusters = Array.from(keywordMap.entries())
    .map(([name, data]) => ({
      name,
      score: Number(data.score.toFixed(2)),
      keywords: Array.from(data.keywords).slice(0, 6),
      examples: Array.from(data.examples).slice(0, 3),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const latest = interests
    .map((item) => item.updatedAt)
    .sort()
    .at(-1);

  return {
    total: interests.length,
    positive: interests.filter((i) => i.kind === "positive").length,
    negative: interests.filter((i) => i.kind === "negative").length,
    readLater: interests.filter((i) => i.kind === "read_later").length,
    clusters,
    updatedAt: latest ?? null,
  };
}

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
  return { key, embedding };
}

function normalizeSimilarity(similarity: number) {
  return clampScore((similarity - SEMANTIC_FLOOR) / (1 - SEMANTIC_FLOOR));
}

function addKeywords(
  map: Map<string, number>,
  keywords: string[],
  weight: number
) {
  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized.length < 2) continue;
    map.set(normalized, (map.get(normalized) ?? 0) + weight);
  }
}

function keywordScore(text: string, keywords: Map<string, number>) {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const [keyword, weight] of keywords) {
    if (normalized.includes(keyword)) {
      score += Math.min(1.5, Math.abs(weight)) * Math.min(1, keyword.length / 8);
    }
  }
  return clampScore(score / 4);
}

function sourcePreferenceScore(
  source: string | undefined,
  preferences: Map<string, number>
) {
  if (!source) return 0.5;
  const score = preferences.get(source);
  if (score === undefined) return 0.5;
  return clampScore((score + 3) / 6);
}

function buildInterestModel(
  interests: InterestItem[],
  cache: Awaited<ReturnType<typeof readEmbeddingCache>>
): InterestModel {
  const positives: InterestSignal[] = [];
  const negatives: InterestSignal[] = [];
  const positiveKeywords = new Map<string, number>();
  const negativeKeywords = new Map<string, number>();
  const sourcePreference = new Map<string, number>();

  for (const item of interests) {
    const weight = signedWeight(item);
    const embedding = item.embeddingKey ? cache[item.embeddingKey] : undefined;
    const keywords = item.keywords.length
      ? item.keywords
      : fallbackKeywords(item.title);

    if (weight > 0) {
      addKeywords(positiveKeywords, keywords, weight);
      if (embedding) positives.push({ item, embedding, weight });
    } else {
      addKeywords(negativeKeywords, keywords, Math.abs(weight));
      if (embedding) negatives.push({ item, embedding, weight });
    }

    if (item.source) {
      sourcePreference.set(
        item.source,
        (sourcePreference.get(item.source) ?? 0) + weight
      );
    }
  }

  positives.sort((a, b) => b.weight - a.weight);
  negatives.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return {
    positives: positives.slice(0, 1200),
    negatives: negatives.slice(0, 800),
    positiveKeywords,
    negativeKeywords,
    sourcePreference,
  };
}

function scoreSemanticMatches(
  embedding: number[],
  signals: InterestSignal[],
  minSimilarity: number
): ScoredMatch[] {
  const matches: ScoredMatch[] = [];
  for (const signal of signals) {
    const similarity = cosineSimilarity(embedding, signal.embedding);
    if (similarity < minSimilarity) continue;
    const signalStrength = Math.min(3, Math.sqrt(Math.abs(signal.weight)));
    matches.push({
      interest: signal.item,
      similarity,
      score: normalizeSimilarity(similarity) * signalStrength,
    });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function hasEnoughEvidence(matches: ScoredMatch[], keyword: number) {
  const strongest = matches[0]?.similarity ?? 0;
  if (strongest >= STRONG_MATCH_SIMILARITY) return true;
  if (matches.length >= 2 && strongest >= MIN_MATCH_SIMILARITY) return true;
  return matches.length >= 1 && keyword >= 0.2;
}

function diversityKey(item: HotCandidateInput) {
  const keywords = fallbackKeywords(itemText(item));
  return keywords.slice(0, 2).join("|") || item.title.slice(0, 12);
}

export interface ScoredRecommendation {
  itemKey: string;
  url?: string;
  score: number;
  baseScore: number;
  llmScore?: number;
  reason: string;
  matchedInterests: string[];
  item: HotCandidateInput;
}

export interface RecommendOutcome {
  recommendations: ScoredRecommendation[];
  interestCount: number;
  profile: InterestProfile;
  configured: boolean;
  candidateCount: number;
}

export async function recommendHotItems(
  items: HotCandidateInput[]
): Promise<RecommendOutcome> {
  const interests = await readInterests();
  const cache = await readEmbeddingCache();
  const profile = buildInterestProfile(interests);
  const model = buildInterestModel(interests, cache);
  const candidateItems = dedupeCandidates(items).slice(0, MAX_SCANNED_ITEMS);

  if (model.positives.length === 0) {
    return {
      recommendations: [],
      interestCount: interests.length,
      profile,
      configured: Boolean(process.env.SILICONFLOW_API_KEY),
      candidateCount: candidateItems.length,
    };
  }

  const scored: Array<RerankCandidate & { item: HotCandidateInput }> = [];

  for (const item of candidateItems) {
    const text = itemText(item);
    const { embedding } = await getEmbedding(text);
    const positiveMatches = scoreSemanticMatches(
      embedding,
      model.positives,
      MIN_MATCH_SIMILARITY
    );
    const negativeMatches = scoreSemanticMatches(
      embedding,
      model.negatives,
      MIN_MATCH_SIMILARITY
    );
    const positiveKeywordScore = keywordScore(text, model.positiveKeywords);
    const negativeKeywordScore = keywordScore(text, model.negativeKeywords);
    const strongestNegative = negativeMatches[0]?.similarity ?? 0;

    if (!hasEnoughEvidence(positiveMatches, positiveKeywordScore)) continue;
    if (
      strongestNegative >= STRONG_NEGATIVE_SIMILARITY ||
      negativeKeywordScore >= 0.5
    ) {
      continue;
    }

    const topPositive = positiveMatches[0]?.score ?? 0;
    const averagePositive =
      positiveMatches.slice(0, 3).reduce((sum, match) => sum + match.score, 0) /
      Math.max(1, Math.min(3, positiveMatches.length));
    const negativePenalty =
      (negativeMatches[0]?.score ?? 0) * 0.34 + negativeKeywordScore * 0.45;
    const sourceScore = sourcePreferenceScore(
      item.source,
      model.sourcePreference
    );
    const evidenceBonus = Math.min(0.08, positiveMatches.length * 0.025);
    const baseScore = clampScore(
      topPositive * 0.36 +
        averagePositive * 0.26 +
        positiveKeywordScore * 0.16 +
        sourceScore * 0.07 +
        heatScore(item.heat_str) * 0.03 +
        evidenceBonus -
        negativePenalty
    );

    if (baseScore < MIN_RECOMMENDATION_SCORE) continue;

    const matchedInterests = positiveMatches
      .slice(0, 4)
      .map((match) => match.interest.title);
    const evidence = fallbackKeywords(text)
      .filter((keyword) => model.positiveKeywords.has(keyword.toLowerCase()))
      .slice(0, 4);

    scored.push({
      itemKey: item.item_key,
      title: item.title,
      source: item.source,
      heat: item.heat_str,
      baseScore,
      matchedInterests,
      semanticScore: Number(topPositive.toFixed(3)),
      keywordScore: Number(positiveKeywordScore.toFixed(3)),
      negativeScore: Number(negativePenalty.toFixed(3)),
      evidence,
      reason: matchedInterests.length
        ? `高置信匹配「${matchedInterests[0]}」`
        : "命中稳定兴趣关键词",
      item,
    });
  }

  // 多样性去重
  const usedDiversityKeys = new Set<string>();
  const diversified = scored
    .sort((a, b) => b.baseScore - a.baseScore)
    .filter((entry) => {
      const key = diversityKey(entry.item);
      if (usedDiversityKeys.has(key)) return false;
      usedDiversityKeys.add(key);
      return true;
    });

  // Top N 走 LLM 加权
  const llmTargets = diversified.slice(0, LLM_RERANK_LIMIT);
  const llmScores = await rerankWithDeepSeek(
    interests,
    llmTargets.map(({ item: _ignored, ...rest }) => rest as RerankCandidate)
  );
  const llmMap = new Map<string, { score: number; reason?: string }>();
  if (llmScores) {
    for (const entry of llmScores) {
      llmMap.set(entry.itemKey, {
        score: clampScore(entry.score),
        reason: entry.reason,
      });
    }
  }

  const finalList: ScoredRecommendation[] = diversified.map((entry) => {
    const llm = llmMap.get(entry.itemKey);
    const base = clampScore(entry.baseScore);
    const finalScore = llm
      ? clampScore(base * (1 - LLM_WEIGHT) + llm.score * LLM_WEIGHT)
      : base;
    return {
      itemKey: entry.itemKey,
      url: entry.item.www_url,
      score: Number(finalScore.toFixed(4)),
      baseScore: Number(base.toFixed(4)),
      llmScore: llm ? Number(llm.score.toFixed(4)) : undefined,
      reason: llm?.reason ?? entry.reason ?? "命中稳定兴趣画像",
      matchedInterests: entry.matchedInterests,
      item: entry.item,
    };
  });

  finalList.sort((a, b) => b.score - a.score);

  return {
    recommendations: finalList.slice(0, RECOMMENDATION_HARD_CAP),
    interestCount: interests.length,
    profile,
    configured: Boolean(process.env.SILICONFLOW_API_KEY),
    candidateCount: candidateItems.length,
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
  const result = await recommendHotItems(candidates);
  const generatedAt = new Date().toISOString();
  const run = saveRun({
    generatedAt,
    durationMs: Date.now() - startedAt,
    candidateCount: result.candidateCount,
    trigger: options.trigger,
    profile: result.profile,
    configured: result.configured,
    items: result.recommendations.map((rec) => ({
      itemKey: rec.itemKey,
      url: rec.url,
      score: rec.score,
      reason: rec.reason,
      matchedInterests: rec.matchedInterests,
      baseScore: rec.baseScore,
      llmScore: rec.llmScore,
      item: rec.item,
    })),
  });
  const records = readLatestRecommendations().records;
  const pool = readHotPool();
  return { run, records, pool: { total: pool.length } };
}
