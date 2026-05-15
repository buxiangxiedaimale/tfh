import type { RebangHotItem } from "@/lib/rebang/types";
import {
  fetchHotItems,
  fetchMenuTabs,
  REBANG_UNSUPPORTED_HINT,
} from "@/lib/rebang/api";
import { rerankWithDeepSeek, type RerankCandidate } from "./deepseek-rerank";
import { getEmbedding } from "./embedding";
import { clampScore, cosineSimilarity } from "./similarity";
import { fallbackKeywords, normalizeText } from "./text";
import {
  readEmbeddingCache,
  readInterests,
  writeInterests,
} from "@/lib/server-data/interest-store";
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

const MAX_PAGES_PER_TAB = 5;

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

function effectiveWeight(interest: InterestItem) {
  const days =
    (Date.now() - new Date(interest.updatedAt).getTime()) / 86400000;
  const halfLifeDays = interest.kind === "negative" ? 120 : 90;
  const decay = Math.pow(0.5, Math.max(0, days) / halfLifeDays);
  return interest.weight * decay;
}

export async function collectGlobalHotCandidates(): Promise<HotCandidateInput[]> {
  const { homeTabs } = await fetchMenuTabs();
  const tabs = homeTabs.filter(
    (tab) => tab.key !== "top" && !REBANG_UNSUPPORTED_HINT[tab.key]
  );
  const batches: HotCandidateInput[] = [];

  for (const tab of tabs) {
    for (let page = 1; page <= MAX_PAGES_PER_TAB; page += 1) {
      try {
        const data = await fetchHotItems(tab.key, { page, tabMeta: tab });
        if (!data.list.length) break;
        batches.push(
          ...data.list.map((item) => ({
            ...item,
            item_key: `${tab.key}:${page}:${item.item_key}`,
            source: tab.name,
          }))
        );
        if (data.current_page >= data.total_page) break;
      } catch {
        // 部分平台或分页偶发不可用，推荐候选池直接跳过，避免污染 PM2 error 日志。
        break;
      }
    }
  }

  const seen = new Set<string>();
  return batches.filter((item) => {
    const key = item.www_url || item.item_key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildInterestProfile(interests: InterestItem[]): InterestProfile {
  const keywordMap = new Map<
    string,
    { score: number; examples: Set<string>; keywords: Set<string> }
  >();
  const positiveKinds = new Set<InterestKind>(["positive", "read_later"]);

  for (const item of interests) {
    if (!positiveKinds.has(item.kind)) continue;
    const weight = Math.max(0.05, effectiveWeight(item));
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
  const interests = await readInterests();
  const existing = interests.find(
    (interest) => interest.url && interest.url === item.www_url
  );
  const delta = kind === "positive" ? 1 : kind === "read_later" ? 0.35 : -1;

  if (existing) {
    existing.kind = kind;
    existing.weight = Math.max(-5, Math.min(10, existing.weight + delta));
    existing.embeddingKey = key;
    existing.updatedAt = now;
  } else {
    interests.unshift({
      id: nanoid(),
      kind,
      title: item.title,
      url: item.www_url,
      source: item.source,
      heat: item.heat_str,
      keywords: fallbackKeywords(text),
      embeddingKey: key,
      weight: delta,
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeInterests(interests.slice(0, 5000));
  return { key, embedding };
}

export async function recommendHotItems(items: HotCandidateInput[]) {
  const interests = await readInterests();
  const cache = await readEmbeddingCache();
  const scored: RerankCandidate[] = [];
  const profile = buildInterestProfile(interests);

  const usableInterests = interests
    .filter((item) => item.embeddingKey && cache[item.embeddingKey])
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return Math.abs(effectiveWeight(b)) - Math.abs(effectiveWeight(a)) || bTime - aTime;
    })
    .slice(0, 1000);

  if (usableInterests.length === 0) {
    return {
      recommendations: [] as HotRecommendation[],
      interestCount: interests.length,
      profile,
      configured: Boolean(process.env.SILICONFLOW_API_KEY),
    };
  }

  for (const item of items.slice(0, 320)) {
    const text = itemText(item);
    const { embedding } = await getEmbedding(text);
    let positiveScore = 0;
    let negativeScore = 0;
    const matched = new Map<string, number>();

    for (const interest of usableInterests) {
      const interestEmbedding = cache[interest.embeddingKey!];
      if (!interestEmbedding) continue;
      const similarity = cosineSimilarity(embedding, interestEmbedding);
      const weight = effectiveWeight(interest);
      const weighted = similarity * Math.min(3, Math.abs(weight));
      if (weight >= 0) {
        if (weighted > positiveScore) positiveScore = weighted;
        if (similarity > 0.45) matched.set(interest.title, similarity);
      } else {
        negativeScore = Math.max(negativeScore, weighted);
      }
    }

    const baseScore = clampScore(
      positiveScore * 0.74 + heatScore(item.heat_str) * 0.16 - negativeScore * 0.45
    );
    if (baseScore < 0.2) continue;

    scored.push({
      itemKey: item.item_key,
      title: item.title,
      source: item.source,
      heat: item.heat_str,
      baseScore,
      matchedInterests: Array.from(matched.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([title]) => title),
    });
  }

  const candidates = scored.sort((a, b) => b.baseScore - a.baseScore).slice(0, 30);
  const reranked = await rerankWithDeepSeek(interests, candidates);
  const fallback = candidates.slice(0, 20).map((item) => ({
    itemKey: item.itemKey,
    score: Number(item.baseScore.toFixed(3)),
    reason: item.matchedInterests.length
      ? `与你关注的「${item.matchedInterests[0]}」相似`
      : "与近期兴趣画像相似",
    matchedInterests: item.matchedInterests,
  }));

  return {
    recommendations: (reranked?.length ? reranked : fallback).sort(
      (a, b) => b.score - a.score
    ).slice(0, 20),
    interestCount: interests.length,
    profile,
    configured: Boolean(process.env.SILICONFLOW_API_KEY),
  };
}
