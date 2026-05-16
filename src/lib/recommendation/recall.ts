import type { RebangHotItem } from "@/lib/rebang/types";
import type {
  InterestItem,
  RecallChannel,
  UserProfile,
} from "@/types";
import { getEmbedding } from "./embedding";
import { cosineSimilarity, clampScore } from "./similarity";
import { fallbackKeywords, normalizeText } from "./text";
import {
  getExposureMap,
  type ExposureRecord,
} from "@/lib/server-data/exposure-store";
import { getHistoryFirstSeen } from "@/lib/server-data/recommendation-store";

/* ============================================================
 * 多通道召回
 *
 * 输入：用户画像 + 候选池
 * 输出：候选 -> { channels[], baseHints } 的 map
 *
 * 五条通道：
 *  1. domain    按画像 domains 关键词+向量匹配
 *  2. identity  按 identity 推断的群体内容
 *  3. style     按 styles 偏好命中文本特征
 *  4. freshness 候选池里"今天首次出现"的内容
 *  5. exploration 画像外的探索：高热但低重合的内容
 *
 * 同时硬性过滤：命中 avoid 关键词的直接淘汰。
 * ============================================================ */

export interface CandidateInput extends RebangHotItem {
  source?: string;
}

export interface RecallEvidence {
  candidate: CandidateInput;
  channels: Set<RecallChannel>;
  domainHits: Array<{ name: string; weight: number; via: "kw" | "vec" }>;
  identityHits: string[];
  styleHits: string[];
  freshnessScore: number; // 0~1，越大越新
  explorationCandidate: boolean;
  semanticTopScore: number; // 与画像中心向量的最高相似度
  semanticAvgScore: number; // top3 平均
  positiveMatches: Array<{ interest: InterestItem; similarity: number }>;
  negativeMatches: Array<{ interest: InterestItem; similarity: number }>;
  exposure?: ExposureRecord;
}

const STRONG_SIM = 0.62;
const MIN_SIM = 0.48;
const FRESHNESS_HOURS = 24; // 候选池里首次出现 < N 小时算"新"

function itemText(item: CandidateInput): string {
  return normalizeText(item.title, item.describe, item.source, item.heat_str);
}

function buildKeywordIndex(words: string[]): Set<string> {
  const set = new Set<string>();
  for (const w of words) {
    const norm = w.trim().toLowerCase();
    if (norm.length >= 2) set.add(norm);
  }
  return set;
}

function textContainsAny(text: string, kw: Iterable<string>): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const k of kw) {
    if (lower.includes(k)) hits.push(k);
  }
  return hits;
}

function heatNumeric(heat?: string): number {
  if (!heat) return 0;
  const match = heat.replace(/,/g, "").match(/([\d.]+)/);
  if (!match) return 0;
  const raw = Number(match[1]);
  const mul = heat.includes("万") ? 10000 : 1;
  return raw * mul;
}

/**
 * 主入口。
 */
export async function recallCandidates(
  profile: UserProfile,
  candidates: CandidateInput[],
  interests: InterestItem[],
  embeddingByInterestKey: Map<string, number[]>,
  options: { explorationBudget?: number } = {}
): Promise<RecallEvidence[]> {
  if (candidates.length === 0) return [];
  const explorationBudget = options.explorationBudget ?? 8;

  // 预计算画像辅助索引
  const domainNames = profile.domains.map((d) => d.name);
  const domainAllKeywords = buildKeywordIndex([
    ...domainNames,
    ...profile.domains.flatMap((d) => d.subtopics),
  ]);
  const identityKeywords = buildKeywordIndex(profile.identity);
  const styleKeywords = buildKeywordIndex(profile.styles);
  const avoidKeywords = buildKeywordIndex(profile.avoid);

  // 画像中心向量（domain name + subtopics 拼起来做语义中心）
  let profileVector: number[] | null = null;
  if (domainNames.length > 0) {
    try {
      const seed = profile.domains
        .slice(0, 6)
        .map(
          (d) =>
            `${d.name} ${d.subtopics.slice(0, 4).join(" ")}`
        )
        .join("。 ");
      const { embedding } = await getEmbedding(seed);
      profileVector = embedding;
    } catch {
      profileVector = null;
    }
  }

  // 正/负向兴趣信号
  const positiveSignals = interests
    .filter((i) => i.kind !== "negative" && i.embeddingKey)
    .map((i) => ({
      interest: i,
      vec: embeddingByInterestKey.get(i.embeddingKey!),
    }))
    .filter((s): s is { interest: InterestItem; vec: number[] } =>
      Boolean(s.vec)
    );
  const negativeSignals = interests
    .filter((i) => i.kind === "negative" && i.embeddingKey)
    .map((i) => ({
      interest: i,
      vec: embeddingByInterestKey.get(i.embeddingKey!),
    }))
    .filter((s): s is { interest: InterestItem; vec: number[] } =>
      Boolean(s.vec)
    );

  // 曝光数据（疲劳信息附在 evidence 上供后续 reranking 用）
  const exposureMap = getExposureMap(
    candidates.map((c) => c.www_url).filter((u): u is string => Boolean(u))
  );
  // 历史首次推荐时间：用于新鲜度（候选首次进入推荐池的时间也是新鲜度信号）
  const historyMap = getHistoryFirstSeen(
    candidates.map((c) => c.www_url).filter((u): u is string => Boolean(u))
  );

  const now = Date.now();
  const evidence: RecallEvidence[] = [];

  // 候选数量大，逐条算 embedding；缓存命中后很快
  for (const candidate of candidates) {
    const text = itemText(candidate);
    const lowerText = text.toLowerCase();

    // 硬过滤：明确避忌
    const avoidHits = textContainsAny(text, avoidKeywords);
    if (avoidHits.length > 0) {
      continue;
    }

    const channels = new Set<RecallChannel>();

    // 通道 1: domain (关键词)
    const domainKwHits = textContainsAny(text, domainAllKeywords);
    const domainHits: RecallEvidence["domainHits"] = [];
    if (domainKwHits.length > 0) {
      channels.add("domain");
      for (const d of profile.domains) {
        const kws = [d.name, ...d.subtopics].map((s) => s.toLowerCase());
        if (kws.some((k) => lowerText.includes(k))) {
          domainHits.push({ name: d.name, weight: d.weight, via: "kw" });
        }
      }
    }

    // 通道 3: style
    const styleHits = textContainsAny(text, styleKeywords);
    if (styleHits.length > 0) channels.add("style");

    // 通道 2: identity (关键词)
    const identityHits = textContainsAny(text, identityKeywords);
    if (identityHits.length > 0) channels.add("identity");

    // 候选语义向量
    let candidateVec: number[] | null = null;
    try {
      const { embedding } = await getEmbedding(text);
      candidateVec = embedding;
    } catch {
      candidateVec = null;
    }

    // 通道 1: domain (向量) -- 即使关键词没命中，向量也可能命中
    if (candidateVec && profileVector) {
      const sim = cosineSimilarity(candidateVec, profileVector);
      if (sim >= MIN_SIM) {
        channels.add("domain");
        if (domainHits.length === 0 && profile.domains[0]) {
          // 把命中最强的领域记为向量命中
          domainHits.push({
            name: profile.domains[0].name,
            weight: profile.domains[0].weight,
            via: "vec",
          });
        }
      }
    }

    // 正向语义相似度排序
    const posMatches = candidateVec
      ? positiveSignals
          .map((s) => ({
            interest: s.interest,
            similarity: cosineSimilarity(candidateVec!, s.vec),
          }))
          .filter((m) => m.similarity >= MIN_SIM)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 8)
      : [];
    const negMatches = candidateVec
      ? negativeSignals
          .map((s) => ({
            interest: s.interest,
            similarity: cosineSimilarity(candidateVec!, s.vec),
          }))
          .filter((m) => m.similarity >= MIN_SIM)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 4)
      : [];

    const topSim = posMatches[0]?.similarity ?? 0;
    const avgSim =
      posMatches.length > 0
        ? posMatches.slice(0, 3).reduce((s, m) => s + m.similarity, 0) /
          Math.min(3, posMatches.length)
        : 0;

    if (topSim >= STRONG_SIM) channels.add("domain");

    // 通道 4: freshness
    const url = candidate.www_url;
    const historyFirst = url ? historyMap.get(url) : undefined;
    let freshnessScore = 0;
    if (!historyFirst) {
      freshnessScore = 1; // 从未被推荐过
    } else {
      const hoursSince =
        (now - new Date(historyFirst).getTime()) / 3_600_000;
      freshnessScore = clampScore(1 - hoursSince / FRESHNESS_HOURS);
    }
    if (freshnessScore > 0.7) channels.add("freshness");

    const exposure = url ? exposureMap.get(url) : undefined;

    // 通道 5: exploration -- 高热但当前画像匹配较弱
    let explorationCandidate = false;
    const heat = heatNumeric(candidate.heat_str);
    if (
      channels.size === 0 &&
      heat >= 50_000 && // 至少 5 万热度
      negMatches.length === 0 &&
      avoidHits.length === 0
    ) {
      explorationCandidate = true;
    }

    // 若没有任何通道命中也非探索候选，丢弃
    if (channels.size === 0 && !explorationCandidate) continue;

    evidence.push({
      candidate,
      channels,
      domainHits,
      identityHits,
      styleHits,
      freshnessScore,
      explorationCandidate,
      semanticTopScore: Number(topSim.toFixed(4)),
      semanticAvgScore: Number(avgSim.toFixed(4)),
      positiveMatches: posMatches,
      negativeMatches: negMatches,
      exposure,
    });
  }

  // 探索候选按热度排序，仅保留预算上限
  const main = evidence.filter((e) => !e.explorationCandidate);
  const exploration = evidence
    .filter((e) => e.explorationCandidate)
    .sort(
      (a, b) =>
        heatNumeric(b.candidate.heat_str) - heatNumeric(a.candidate.heat_str)
    )
    .slice(0, explorationBudget)
    .map((e) => {
      e.channels.add("exploration");
      return e;
    });

  return [...main, ...exploration];
}
