import type { ParsedTaskIntent } from "@/lib/ai/types";

export async function parseTaskWithAI(
  text: string
): Promise<{ data?: ParsedTaskIntent; error?: string }> {
  const res = await fetch("/api/ai/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const json = await res.json();
  if (!res.ok) {
    return { error: json.error ?? "AI 解析失败" };
  }
  return { data: json.data as ParsedTaskIntent };
}
