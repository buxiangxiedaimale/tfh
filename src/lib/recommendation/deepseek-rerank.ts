import type { HotRecommendation, InterestItem } from "@/types";

export interface RerankCandidate {
  itemKey: string;
  title: string;
  source?: string;
  heat?: string;
  baseScore: number;
  matchedInterests: string[];
}

interface DeepSeekRerankResponse {
  recommendations?: HotRecommendation[];
}

const SYSTEM_PROMPT = `你是用户的私人信息推荐助手。
请根据用户历史兴趣样本，对候选热搜进行个性化重排。
只输出 JSON，不要 markdown。
输出格式：
{"recommendations":[{"itemKey":"...","score":0.92,"reason":"推荐理由，简洁具体","matchedInterests":["兴趣标题1"]}]}
要求：
- score 为 0 到 1。
- 推荐理由必须结合用户兴趣，不要泛泛而谈。
- 如果候选与负反馈明显相似，降低分数。
- 最多返回 20 条。`;

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
            candidates: candidates.slice(0, 30),
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
