import {
  addDays,
  format,
  isBefore,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from "date-fns";
import { zhCN } from "date-fns/locale";

export function formatDueDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const date = parseISO(dateStr);
  if (isToday(date)) return "今天";
  if (isTomorrow(date)) return "明天";
  if (isYesterday(date)) return "昨天";
  return format(date, "M月d日 EEE", { locale: zhCN });
}

export function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  const date = startOfDay(parseISO(dateStr));
  return isBefore(date, startOfDay(new Date()));
}

export function isDueToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  return isToday(parseISO(dateStr));
}

export function isDueInUpcoming(dateStr?: string, days = 7): boolean {
  if (!dateStr) return false;
  const date = parseISO(dateStr);
  const end = addDays(startOfDay(new Date()), days);
  const start = startOfDay(new Date());
  return !isBefore(date, start) && !isBefore(end, date);
}

export function isSameDate(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return isSameDay(parseISO(a), parseISO(b));
}

export function toDateInputValue(date?: Date): string {
  return format(date ?? new Date(), "yyyy-MM-dd");
}
