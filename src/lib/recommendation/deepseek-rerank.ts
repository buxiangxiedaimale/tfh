import type { HotRecommendation, InterestItem } from "@/types";

export interface RerankCandidate {
  itemKey: string;
  title: string;
  source?: string;
  heat?: string;
  baseScore: number;
  matchedInterests: string[];
  semanticScore?: number;
  keywordScore?: number;
  negativeScore?: number;
  evidence?: string[];
  reason?: string;
}

interface DeepSeekRerankResponse {
  recommendations?: HotRecommendation[];
}

const SYSTEM_PROMPT = `你是一个准确率优先的私人信息推荐系统精排器。
你的任务是对粗排已通过的知乎/微博候选逐条打一个 0~1 之间的精排分，用于和粗排基础分加权。
只输出 JSON，不要 markdown。
输出格式：
{"recommendations":[{"itemKey":"...","score":0.86,"reason":"推荐理由，简洁具体","matchedInterests":["兴趣标题1"]}]}
要求：
- 必须为传入的每一条候选都返回一个 score。
- score 反映与用户正向兴趣的吻合程度：0.85+ 高度相关、0.6~0.85 较相关、<0.5 弱相关或与负反馈接近。
- 与负反馈、低质量八卦、标题党、泛娱乐噪声相似的候选必须给出 <0.4 的分数。
- 推荐理由必须引用具体兴趣或证据，不要写“你可能感兴趣”这类泛泛表述。
- 输出顺序与输入顺序无关，但 itemKey 必须严格匹配输入。`;

export async function rerankWithDeepSeek(
  interests: InterestItem[],
  candidates: RerankCandidate[]
): Promise<HotRecommendation[] | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || candidates.length === 0) return null;

  const interestContext = interests
    .slice(0, 80)
    .map((item) => ({
      kind: item.kind,
      title: item.title,
      source: item.source,
      keywords: item.keywords,
      weight: item.weight,
    }));

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            interests: interestContext,
            candidates: candidates.slice(0, 50),
          }),
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("DeepSeek rerank failed", await res.text());
    return null;
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as DeepSeekRerankResponse;
    return parsed.recommendations ?? null;
  } catch (error) {
    console.error("Failed to parse DeepSeek rerank response", error);
    return null;
  }
}
