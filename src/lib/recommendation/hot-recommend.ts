import type { RebangHotItem } from "@/lib/rebang/types";
import { rerankWithDeepSeek, type RerankCandidate } from "./deepseek-rerank";
import { getEmbedding } from "./embedding";
import { clampScore, cosineSimilarity } from "./similarity";
import { fallbackKeywords, normalizeText } from "./text";
import {
  readEmbeddingCache,
  readInterests,
  writeInterests,
} from "@/lib/server-data/interest-store";
import type { HotRecommendation, InterestItem, InterestKind } from "@/types";
import { nanoid } from "nanoid";

export interface HotCandidateInput extends RebangHotItem {
  source?: string;
}

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

  const usableInterests = interests
    .filter((item) => item.embeddingKey && cache[item.embeddingKey])
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return Math.abs(b.weight) - Math.abs(a.weight) || bTime - aTime;
    })
    .slice(0, 1000);

  if (usableInterests.length === 0) {
    return {
      recommendations: [] as HotRecommendation[],
      interestCount: interests.length,
      configured: Boolean(process.env.SILICONFLOW_API_KEY),
    };
  }

  for (const item of items.slice(0, 120)) {
    const text = itemText(item);
    const { embedding } = await getEmbedding(text);
    let positiveScore = 0;
    let negativeScore = 0;
    const matched = new Map<string, number>();

    for (const interest of usableInterests) {
      const interestEmbedding = cache[interest.embeddingKey!];
      if (!interestEmbedding) continue;
      const similarity = cosineSimilarity(embedding, interestEmbedding);
      const weighted = similarity * Math.min(3, Math.abs(interest.weight));
      if (interest.weight >= 0) {
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

  const candidates = scored.sort((a, b) => b.baseScore - a.baseScore).slice(0, 24);
  const reranked = await rerankWithDeepSeek(interests, candidates);
  const fallback = candidates.slice(0, 12).map((item) => ({
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
    ),
    interestCount: interests.length,
    configured: Boolean(process.env.SILICONFLOW_API_KEY),
  };
}
