"use client";

import {
  CalendarDays,
  Inbox,
  LayoutList,
  MoreHorizontal,
  Sun,
} from "lucide-react";
import { getAppMode } from "@/lib/app-mode";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";
import type { ViewId } from "@/types";

const chips: { id: ViewId; label: string; icon: typeof Inbox }[] = [
  { id: "today", label: "今天", icon: Sun },
  { id: "inbox", label: "收集箱", icon: Inbox },
  { id: "upcoming", label: "即将", icon: CalendarDays },
  { id: "all", label: "全部", icon: LayoutList },
];

export function TaskNavChips() {
  const { activeView, setActiveView, setSidebarOpen, getTaskCount } =
    useTodoStore();

  if (getAppMode(activeView) !== "tasks") return null;
  if (activeView.startsWith("project:")) return null;

  return (
    <div className="shrink-0 border-b border-border/60 bg-surface-1/50 px-3 py-2.5 lg:hidden">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
        {chips.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          const count = getTaskCount(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-all duration-200",
                active
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-surface-2/80 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {count > 0 && id !== "completed" ? (
                <span
                  className={cn(
                    "min-w-[18px] rounded-md px-1 text-center text-[10px] font-medium",
                    active
                      ? "bg-accent-foreground/20"
                      : "bg-surface-3 text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-surface-2/80 px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          aria-label="更多列表与项目"
        >
          <MoreHorizontal className="h-4 w-4" />
          更多
        </button>
      </div>
    </div>
  );
}
