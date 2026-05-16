import type { RankedItem } from "./ranking";
import { cosineSimilarity } from "./similarity";
import { fallbackKeywords, normalizeText } from "./text";
import { getEmbedding } from "./embedding";

/* ============================================================
 * 重排：MMR 多样性 + 探索注入 + 同源/同话题约束
 *
 *  - MMR (Maximal Marginal Relevance):
 *      在保证相关性的前提下，每次选下一条都倾向于跟已选不太像，
 *      避免 Top N 全是同一事件的不同表述。
 *
 *  - 探索注入:
 *      强制保留至少 minExploration 条来自 exploration 通道的候选，
 *      扩展用户兴趣边界。
 *
 *  - 同源约束:
 *      避免同一来源 (例如「微博」) 在 Top 10 里超过 maxPerSource。
 * ============================================================ */

export interface RerankOptions {
  capacity?: number; // 最终保留多少条
  lambda?: number; // MMR 权衡参数 (0~1)：越大越偏相关，越小越偏多样
  minExploration?: number; // 至少保留多少条探索候选
  maxPerSource?: number; // 单一来源在前 capacity 中的最大占比上限
}

const DEFAULT_OPTIONS: Required<RerankOptions> = {
  capacity: 60,
  lambda: 0.72,
  minExploration: 2,
  maxPerSource: Number.POSITIVE_INFINITY,
};

/**
 * 候选间相似度：优先用向量；缺向量时退化为关键词 Jaccard。
 */
function buildSimilarityIndex(items: RankedItem[]): {
  vectorMap: Map<string, number[]>;
  keywordMap: Map<string, Set<string>>;
} {
  const vectorMap = new Map<string, number[]>();
  const keywordMap = new Map<string, Set<string>>();
  for (const item of items) {
    const key = item.evidence.candidate.item_key;
    const text = normalizeText(
      item.evidence.candidate.title,
      item.evidence.candidate.describe
    );
    keywordMap.set(key, new Set(fallbackKeywords(text)));
  }
  return { vectorMap, keywordMap };
}

async function similarity(
  a: RankedItem,
  b: RankedItem,
  cache: {
    vectorMap: Map<string, number[]>;
    keywordMap: Map<string, Set<string>>;
  }
): Promise<number> {
  const keyA = a.evidence.candidate.item_key;
  const keyB = b.evidence.candidate.item_key;
  let vecA = cache.vectorMap.get(keyA);
  let vecB = cache.vectorMap.get(keyB);
  if (!vecA) {
    try {
      const { embedding } = await getEmbedding(
        normalizeText(a.evidence.candidate.title, a.evidence.candidate.describe)
      );
      vecA = embedding;
      cache.vectorMap.set(keyA, embedding);
    } catch {
      vecA = undefined;
    }
  }
  if (!vecB) {
    try {
      const { embedding } = await getEmbedding(
        normalizeText(b.evidence.candidate.title, b.evidence.candidate.describe)
      );
      vecB = embedding;
      cache.vectorMap.set(keyB, embedding);
    } catch {
      vecB = undefined;
    }
  }
  if (vecA && vecB) return cosineSimilarity(vecA, vecB);
  // 关键词 Jaccard fallback
  const setA = cache.keywordMap.get(keyA) ?? new Set<string>();
  const setB = cache.keywordMap.get(keyB) ?? new Set<string>();
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) {
    if (setB.has(v)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * MMR 主流程。
 */
export async function applyRerank(
  ranked: RankedItem[],
  options: RerankOptions = {}
): Promise<RankedItem[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (ranked.length <= 1) return ranked.slice();
  const cache = buildSimilarityIndex(ranked);

  const remaining = ranked.slice();
  const selected: RankedItem[] = [];
  const sourceCount = new Map<string, number>();

  const passesSourceCap = (item: RankedItem) => {
    if (opts.maxPerSource === Number.POSITIVE_INFINITY) return true;
    const src = item.evidence.candidate.source ?? "未知";
    const used = sourceCount.get(src) ?? 0;
    return used < opts.maxPerSource;
  };

  // 优先取最高分（且通过 source cap）作为第一条
  remaining.sort((a, b) => b.finalScore - a.finalScore);
  while (remaining.length > 0 && selected.length === 0) {
    const head = remaining.shift()!;
    if (passesSourceCap(head)) {
      selected.push(head);
      const src = head.evidence.candidate.source ?? "未知";
      sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
    }
  }

  while (selected.length < opts.capacity && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const item = remaining[i];
      if (!passesSourceCap(item)) continue;
      // 与已选的最大相似度
      let maxSim = 0;
      for (const chosen of selected) {
        const sim = await similarity(item, chosen, cache);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr =
        opts.lambda * item.finalScore - (1 - opts.lambda) * maxSim;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    const src = picked.evidence.candidate.source ?? "未知";
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
  }

  // 探索注入：若已选里探索数量不足，从剩余探索候选中补
  if (opts.minExploration > 0) {
    const haveExploration = selected.filter((s) =>
      s.evidence.channels.has("exploration")
    ).length;
    let need = opts.minExploration - haveExploration;
    if (need > 0) {
      const explorationLeft = remaining
        .filter((r) => r.evidence.channels.has("exploration"))
        .sort((a, b) => b.finalScore - a.finalScore);
      for (const ex of explorationLeft) {
        if (need <= 0) break;
        // 替换掉末尾一条非探索的
        const replaceIdx = [...selected].reverse().findIndex(
          (s) => !s.evidence.channels.has("exploration")
        );
        if (replaceIdx === -1) break;
        const actualIdx = selected.length - 1 - replaceIdx;
        selected[actualIdx] = ex;
        need -= 1;
      }
    }
  }

  return selected;
}
