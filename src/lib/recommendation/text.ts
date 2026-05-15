import { createHash } from "node:crypto";

export function normalizeText(...parts: Array<string | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textKey(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function fallbackKeywords(text: string): string[] {
  const cleaned = text
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}\s+#-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  const chineseChunks = cleaned.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  return Array.from(new Set([...words, ...chineseChunks])).slice(0, 8);
}
