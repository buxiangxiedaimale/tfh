import {
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfDay,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Memo } from "@/types";

const TAG_REGEX = /#([^\s#]+)/g;

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(TAG_REGEX.source, "g");
  while ((match = re.exec(content)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}

export function formatMemoDate(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return "今天";
  if (isYesterday(date)) return "昨天";
  return format(date, "M月d日 EEE", { locale: zhCN });
}

export function groupMemosByDate(memos: Memo[]): { label: string; items: Memo[] }[] {
  const sorted = [...memos].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const groups = new Map<string, Memo[]>();
  for (const memo of sorted) {
    const key = format(startOfDay(parseISO(memo.createdAt)), "yyyy-MM-dd");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(memo);
  }

  return Array.from(groups.entries()).map(([, items]) => ({
    label: formatMemoDate(items[0].createdAt),
    items,
  }));
}

export function getAllMemoTags(memos: Memo[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const memo of memos) {
    for (const tag of memo.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function splitContentParts(content: string): { type: "text" | "tag"; value: string }[] {
  const parts: { type: "text" | "tag"; value: string }[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TAG_REGEX.source, "g");
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: content.slice(last, match.index) });
    }
    parts.push({ type: "tag", value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    parts.push({ type: "text", value: content.slice(last) });
  }
  return parts;
}
