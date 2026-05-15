"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";

export function CalendarView() {
  const {
    calendarMonth,
    setCalendarMonth,
    getTasksForDate,
    setSelectedTaskId,
    tasks,
  } = useTodoStore();

  const monthDate = parseISO(`${calendarMonth}-01`);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const prevMonth = () =>
    setCalendarMonth(format(addMonths(monthDate, -1), "yyyy-MM"));
  const nextMonth = () =>
    setCalendarMonth(format(addMonths(monthDate, 1), "yyyy-MM"));

  const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4 sm:px-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">日历</h2>
          <p className="text-sm text-muted-foreground">
            {tasks.filter((t) => t.dueDate && !t.completed).length} 个待办有日期
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-semibold">
            {format(monthDate, "yyyy年 M月", { locale: zhCN })}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {weekDays.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayTasks = getTasksForDate(dateStr);
            const inMonth = isSameMonth(day, monthDate);
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => {
                  if (dayTasks[0]) setSelectedTaskId(dayTasks[0].id);
                }}
                className={cn(
                  "min-h-[88px] rounded-xl border border-transparent p-1.5 text-left transition-colors hover:border-border hover:bg-surface-2 sm:min-h-[100px]",
                  !inMonth && "opacity-40",
                  isToday(day) && "border-accent/40 bg-accent/5"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday(day) && "bg-accent text-accent-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                <ul className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[10px] sm:text-xs",
                        t.completed
                          ? "bg-surface-3 text-muted-foreground line-through"
                          : "bg-accent/15 text-foreground"
                      )}
                    >
                      {t.title}
                    </li>
                  ))}
                  {dayTasks.length > 3 && (
                    <li className="px-1 text-[10px] text-muted-foreground">
                      +{dayTasks.length - 3}
                    </li>
                  )}
                </ul>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
