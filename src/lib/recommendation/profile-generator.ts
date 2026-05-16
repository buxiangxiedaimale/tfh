import type { InterestItem, UserProfile } from "@/types";
import { readInterests } from "@/lib/server-data/interest-store";
import {
  applyOverrides,
  readActiveProfileRaw,
  readOverrides,
  saveProfile,
} from "@/lib/server-data/profile-store";
import { fallbackKeywords } from "./text";

/* ============================================================
 * LLM 结构化画像生成器
 *
 * 策略：
 *   1. 重模型 (deepseek-chat) 低频生成
 *   2. 触发条件：兴趣样本数 > 上次生成时 +REGEN_INTEREST_DELTA，或 force
 *   3. LLM 输出 JSON: { identity, domains, styles, avoid, summary }
 *   4. 合并 profile_overrides 中的手动加减
 * ============================================================ */

const REGEN_INTEREST_DELTA = 10; // 兴趣样本每涨 10 条就重新生成
const MAX_SAMPLES_PER_KIND = 60; // 送给 LLM 的样本上限（控制 token）
const REQUEST_TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `你是一位资深的个性化推荐分析师。
基于用户的兴趣样本（正向、负向、稍后看），输出一份结构化用户画像。
你需要从样本中提炼**领域、身份、内容偏好风格、明确不喜欢的话题**。

仅输出 JSON，不要包裹 markdown 代码块。格式：
{
  "identity": ["string", ...],
  "domains": [
    { "name": "string", "weight": 0~1, "subtopics": ["string", ...] }
  ],
  "styles": ["string", ...],
  "avoid": ["string", ...],
  "summary": "string",
  "identityInferences": ["string", ...]
}

要求：
- identity: 推断的用户身份/职业/角色，3 个以内，例如「软件工程师」「投资爱好者」「家长」。从行为里推断，不要瞎猜。
- domains: 兴趣领域，每个含权重 (0~1) 和 2-5 个子话题。最多 8 个领域，按权重从高到低排。
  - name 要具体: 用「AI/大模型」「云原生」「家庭教育」而非「科技」「教育」这种太泛的词。
  - subtopics 是用户在此领域具体关注的话题/人物/产品。
  - weight 反映该领域在用户兴趣中的占比。
- styles: 用户偏好的内容形式，例如「深度技术解析」「上手教程」「行业八卦」「新闻速报」。最多 5 个。
- avoid: 用户明确排斥的内容类型（来自负向样本），例如「明星八卦」「政治军事」。最多 5 个。
- summary: 一句话总结这个用户，30 字以内。
- identityInferences: 解释为什么推断出上面的 identity，每条对应一个 identity 的证据。

关键原则：
- 准确 > 全面。宁可少给标签，不要拍脑袋编。
- 若样本不足以支撑某个推断，留空数组即可。
- 不要给笼统标签（如「热点」「新闻」「内容」）。
- domains 的 name 必须能用于关键词匹配，避免使用「我感兴趣的东西」这种无效词。`;

interface LlmProfileShape {
  identity?: string[];
  domains?: Array<{ name: string; weight: number; subtopics: string[] }>;
  styles?: string[];
  avoid?: string[];
  summary?: string;
  identityInferences?: string[];
}

/**
 * 调 DeepSeek 生成结构化画像。
 * 失败时返回 null，调用方需要 fallback。
 */
async function generateWithLlm(
  interests: InterestItem[]
): Promise<LlmProfileShape | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || interests.length === 0) return null;

  const positives = interests
    .filter((i) => i.kind === "positive")
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, MAX_SAMPLES_PER_KIND);
  const negatives = interests
    .filter((i) => i.kind === "negative")
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, MAX_SAMPLES_PER_KIND);
  const readLater = interests
    .filter((i) => i.kind === "read_later")
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, MAX_SAMPLES_PER_KIND);

  const slim = (items: InterestItem[]) =>
    items.map((it) => ({
      title: it.title,
      source: it.source,
      keywords: it.keywords.length
        ? it.keywords.slice(0, 6)
        : fallbackKeywords(it.title).slice(0, 6),
      weight: Number(it.weight.toFixed(2)),
    }));

  const payload = {
    positives: slim(positives),
    negatives: slim(negatives),
    readLater: slim(readLater),
    total: interests.length,
  };

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
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[profile-generator] DeepSeek 失败", res.status, txt);
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    try {
      return JSON.parse(content) as LlmProfileShape;
    } catch (e) {
      console.error("[profile-generator] JSON 解析失败", e);
      return null;
    }
  } catch (e) {
    console.error("[profile-generator] 请求异常", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback：基于聚类关键词的简单画像生成，LLM 不可用时兜底。
 */
function generateFallback(interests: InterestItem[]): LlmProfileShape {
  const positiveKw = new Map<string, number>();
  const negativeKw = new Map<string, number>();
  for (const item of interests) {
    const keys = item.keywords.length
      ? item.keywords
      : fallbackKeywords(item.title);
    for (const k of keys.slice(0, 5)) {
      const norm = k.trim();
      if (norm.length < 2) continue;
      const map = item.kind === "negative" ? negativeKw : positiveKw;
      map.set(norm, (map.get(norm) ?? 0) + Math.abs(item.weight || 1));
    }
  }
  const topPositive = Array.from(positiveKw.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topNegative = Array.from(negativeKw.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const maxWeight = topPositive[0]?.[1] ?? 1;
  return {
    identity: [],
    domains: topPositive.map(([name, w]) => ({
      name,
      weight: Number(Math.min(1, w / maxWeight).toFixed(2)),
      subtopics: [],
    })),
    styles: [],
    avoid: topNegative.map(([name]) => name),
    summary: "兴趣画像（自动聚类，建议后续手动微调）",
  };
}

function normalizeLlmShape(
  shape: LlmProfileShape
): Omit<UserProfile, "generatedAt" | "source" | "interestCount" | "stats"> {
  const trim = (s: string) => s.trim();
  const cleanArr = (a?: string[]) =>
    Array.isArray(a)
      ? a.map(trim).filter((s) => s.length > 0).slice(0, 8)
      : [];
  const domains = Array.isArray(shape.domains)
    ? shape.domains
        .filter((d) => d && typeof d.name === "string" && d.name.trim())
        .slice(0, 8)
        .map((d) => ({
          name: trim(d.name),
          weight: Math.max(0, Math.min(1, Number(d.weight) || 0.5)),
          subtopics: cleanArr(d.subtopics).slice(0, 6),
        }))
        .sort((a, b) => b.weight - a.weight)
    : [];
  return {
    identity: cleanArr(shape.identity).slice(0, 3),
    domains,
    styles: cleanArr(shape.styles).slice(0, 5),
    avoid: cleanArr(shape.avoid).slice(0, 5),
    summary: trim(shape.summary ?? ""),
    identityInferences: cleanArr(shape.identityInferences).slice(0, 3),
  };
}

function buildStats(interests: InterestItem[]): UserProfile["stats"] {
  return {
    total: interests.length,
    positive: interests.filter((i) => i.kind === "positive").length,
    negative: interests.filter((i) => i.kind === "negative").length,
    readLater: interests.filter((i) => i.kind === "read_later").length,
  };
}

function shouldRegenerate(
  active: UserProfile | null,
  currentInterestCount: number
): boolean {
  if (!active) return true;
  if (active.source !== "llm") return true;
  if (currentInterestCount - active.interestCount >= REGEN_INTEREST_DELTA) {
    return true;
  }
  return false;
}

/**
 * 生成或读取画像，并合并 overrides。
 * @param force 强制重新调 LLM 生成。
 */
export async function ensureUserProfile(
  force: boolean = false
): Promise<UserProfile> {
  const interests = await readInterests();
  const active = readActiveProfileRaw();

  let raw: UserProfile | null = active;
  if (force || shouldRegenerate(active, interests.length)) {
    const llm = await generateWithLlm(interests);
    const shape = llm ?? generateFallback(interests);
    const normalized = normalizeLlmShape(shape);
    raw = saveProfile({
      profile: { ...normalized, stats: buildStats(interests) },
      source: llm ? "llm" : "fallback",
      interestCount: interests.length,
    });
  }
  if (!raw) {
    // 没有 active 也没生成成功，给一个空画像
    raw = saveProfile({
      profile: {
        identity: [],
        domains: [],
        styles: [],
        avoid: [],
        summary: "样本不足，请继续点击「感兴趣 / 不感兴趣」积累兴趣样本。",
        stats: buildStats(interests),
      },
      source: "fallback",
      interestCount: interests.length,
    });
  }
  const overrides = readOverrides();
  return applyOverrides(raw, overrides);
}

/**
 * 仅读取当前画像（合并 overrides），不触发重生成。
 */
export function readMergedProfile(): UserProfile | null {
  const active = readActiveProfileRaw();
  if (!active) return null;
  const overrides = readOverrides();
  return applyOverrides(active, overrides);
}
