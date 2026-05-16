import type { FeatureScores, UserProfile } from "@/types";
import type { RecallEvidence } from "./recall";
import { clampScore } from "./similarity";
import { fatigueScore } from "@/lib/server-data/exposure-store";

/* ============================================================
 * LLM 多维精排
 *
 * 把召回结果送给 LLM，对每条候选输出多维评分：
 *  - domainMatch  领域是否切中画像
 *  - styleMatch   内容形式是否符合用户偏好
 *  - novelty      新颖度（是否带来新信息）
 *  - quality      内容质量推断（避开标题党/八卦/水帖）
 *  - llmOverall   LLM 给出的综合分
 *
 * 失败时 fallback 到基于召回信号的简化打分。
 * ============================================================ */

const BATCH_SIZE = 25;
const MAX_BATCHES = 4; // 至多 4 批 = 100 条
const REQUEST_TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `你是一个工业级精排器，工作类似于抖音/淘宝推荐链路里的 ranking 阶段。
你会拿到一个结构化用户画像和一批候选热搜，你需要对每条候选独立打分。

仅输出 JSON，不要 markdown 代码块。格式：
{
  "scores": [
    {
      "itemKey": "string",
      "domainMatch": 0~1,
      "styleMatch": 0~1,
      "novelty": 0~1,
      "quality": 0~1,
      "llmOverall": 0~1,
      "reason": "string"
    }
  ]
}

字段含义：
- domainMatch: 与画像 domains 的契合程度，1=完全命中用户高权重领域，0=完全不相关。
- styleMatch: 与画像 styles 的契合程度，找不到风格信号给 0.5 中性分。
- novelty: 这条信息相对于用户已知兴趣的新颖度（是否带来新视角/新事件），与同质化内容打低分。
- quality: 推断内容质量。标题党/纯八卦/广告/低信息密度给 < 0.3。深度报道/专业讨论/上手内容给 > 0.7。
- llmOverall: 你作为推荐器的综合判断分，可独立于上述四维。
- reason: 一句话推荐/不推荐理由，必须具体到画像中的某个 identity/domain/style。

要求：
- 对每一条输入候选都必须返回一条 score，itemKey 严格一致。
- 命中画像 avoid 的内容必须 llmOverall < 0.2。
- 与画像高度不相关的内容 llmOverall < 0.35。
- 把握尺度：高度相关 + 高质量才给 > 0.85。`;

interface LlmScoreShape {
  itemKey: string;
  domainMatch?: number;
  styleMatch?: number;
  novelty?: number;
  quality?: number;
  llmOverall?: number;
  reason?: string;
}

interface LlmBatchResponse {
  scores?: LlmScoreShape[];
}

export interface RankedItem {
  evidence: RecallEvidence;
  features: FeatureScores;
  fatigue: number;
  finalScore: number;
  reason: string;
}

function clip(v: unknown, fallback = 0.5): number {
  if (typeof v !== "number" || Number.isNaN(v)) return fallback;
  return clampScore(v);
}

function evidenceToCandidatePayload(ev: RecallEvidence) {
  return {
    itemKey: ev.candidate.item_key,
    title: ev.candidate.title,
    source: ev.candidate.source,
    heat: ev.candidate.heat_str,
    describe: ev.candidate.describe?.slice(0, 200),
    recallChannels: Array.from(ev.channels),
    domainHits: ev.domainHits.slice(0, 4).map((d) => d.name),
    matchedInterests: ev.positiveMatches
      .slice(0, 3)
      .map((m) => m.interest.title),
    freshnessScore: ev.freshnessScore,
    semanticTopScore: ev.semanticTopScore,
  };
}

function buildBatchPayload(profile: UserProfile, batch: RecallEvidence[]) {
  return {
    profile: {
      identity: profile.identity,
      domains: profile.domains.map((d) => ({
        name: d.name,
        weight: d.weight,
        subtopics: d.subtopics,
      })),
      styles: profile.styles,
      avoid: profile.avoid,
      summary: profile.summary,
    },
    candidates: batch.map(evidenceToCandidatePayload),
  };
}

async function callLlmBatch(
  profile: UserProfile,
  batch: RecallEvidence[]
): Promise<Map<string, LlmScoreShape>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return new Map();
  if (batch.length === 0) return new Map();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify(buildBatchPayload(profile, batch)),
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[ranking] LLM 失败", res.status);
      return new Map();
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return new Map();
    const parsed = JSON.parse(content) as LlmBatchResponse;
    const map = new Map<string, LlmScoreShape>();
    for (const s of parsed.scores ?? []) {
      if (s.itemKey) map.set(s.itemKey, s);
    }
    return map;
  } catch (e) {
    console.error("[ranking] 请求异常", e);
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 根据召回证据 + LLM 输出 计算 baseScore（不依赖 LLM 的部分）。
 * baseScore 来自召回信号融合：
 *  - 语义匹配（top + avg）
 *  - 领域命中数量
 *  - 多通道命中加分
 *  - 负向相似度惩罚
 */
function computeBaseScore(ev: RecallEvidence): number {
  const top = ev.semanticTopScore;
  const avg = ev.semanticAvgScore;
  const channelBonus = Math.min(0.2, (ev.channels.size - 1) * 0.05);
  const domainBonus = Math.min(
    0.15,
    ev.domainHits.reduce((s, h) => s + h.weight * 0.05, 0)
  );
  const negativePenalty =
    ev.negativeMatches[0]?.similarity > 0
      ? Math.max(0, (ev.negativeMatches[0]?.similarity ?? 0) - 0.4) * 0.6
      : 0;
  return clampScore(
    top * 0.4 + avg * 0.25 + channelBonus + domainBonus - negativePenalty + 0.1
  );
}

function computeFinalScore(features: FeatureScores, fatigue: number): number {
  // 权重设计：LLM 综合 > 领域 > 质量 > 风格 > 新颖；基础分作为锚点；疲劳整体衰减
  const raw =
    features.llmOverall * 0.32 +
    features.domainMatch * 0.22 +
    features.quality * 0.16 +
    features.styleMatch * 0.1 +
    features.novelty * 0.08 +
    features.baseScore * 0.12;
  // 疲劳衰减：fatigue 0~1，1=完全衰减
  return clampScore(raw * (1 - fatigue * 0.7));
}

function buildFallbackFeatures(ev: RecallEvidence): FeatureScores {
  const base = computeBaseScore(ev);
  return {
    baseScore: base,
    domainMatch: clampScore(
      ev.domainHits.reduce((s, h) => s + h.weight * 0.5, 0)
    ),
    styleMatch: ev.styleHits.length > 0 ? 0.7 : 0.4,
    novelty: ev.freshnessScore,
    quality: 0.55,
    llmOverall: clampScore(base * 0.95),
  };
}

/**
 * 主入口。输入召回证据，输出排序后的精排结果。
 */
export async function rankCandidates(
  profile: UserProfile,
  evidence: RecallEvidence[],
  options: { llmEnabled?: boolean } = {}
): Promise<RankedItem[]> {
  if (evidence.length === 0) return [];
  const llmEnabled =
    options.llmEnabled !== false && Boolean(process.env.DEEPSEEK_API_KEY);

  // 限制送给 LLM 的数量
  const llmTargetCount = BATCH_SIZE * MAX_BATCHES;
  const llmTargets = evidence.slice(0, llmTargetCount);
  const overflow = evidence.slice(llmTargetCount);

  // 分批调用 LLM
  const llmScores = new Map<string, LlmScoreShape>();
  if (llmEnabled) {
    for (let i = 0; i < llmTargets.length; i += BATCH_SIZE) {
      const batch = llmTargets.slice(i, i + BATCH_SIZE);
      const result = await callLlmBatch(profile, batch);
      for (const [k, v] of result) llmScores.set(k, v);
    }
  }

  const ranked: RankedItem[] = [];
  for (const ev of evidence) {
    const fatigue = fatigueScore(ev.exposure);
    const llm = llmScores.get(ev.candidate.item_key);
    const features: FeatureScores = llm
      ? {
          baseScore: computeBaseScore(ev),
          domainMatch: clip(llm.domainMatch, 0.5),
          styleMatch: clip(llm.styleMatch, 0.5),
          novelty: clip(llm.novelty, 0.5),
          quality: clip(llm.quality, 0.5),
          llmOverall: clip(llm.llmOverall, 0.5),
        }
      : buildFallbackFeatures(ev);
    const finalScore = computeFinalScore(features, fatigue);
    const reason =
      llm?.reason ??
      (ev.domainHits[0]
        ? `命中你关注的「${ev.domainHits[0].name}」领域`
        : ev.explorationCandidate
        ? "热门话题，可能扩展你的兴趣边界"
        : "命中你的兴趣画像");
    ranked.push({
      evidence: ev,
      features,
      fatigue,
      finalScore,
      reason,
    });
    void overflow; // 仅占位，overflow 不进 LLM 但仍参与排序
  }

  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return ranked;
}
