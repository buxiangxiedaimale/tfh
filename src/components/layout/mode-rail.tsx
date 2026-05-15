"use client";

import { Flame, ListTodo, StickyNote } from "lucide-react";
import { getAppMode } from "@/lib/app-mode";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";
import type { AppMode } from "@/types";

const modes: { mode: AppMode; label: string; icon: typeof ListTodo }[] = [
  { mode: "tasks", label: "待办", icon: ListTodo },
  { mode: "memo", label: "小记", icon: StickyNote },
  { mode: "hot", label: "热榜", icon: Flame },
];

export function ModeRail() {
  const activeView = useTodoStore((s) => s.activeView);
  const setAppMode = useTodoStore((s) => s.setAppMode);
  const current = getAppMode(activeView);

  return (
    <aside
      className="hidden w-[60px] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface-1 py-4 md:flex"
      aria-label="模块切换"
    >
      {modes.map(({ mode, label, icon: Icon }) => {
        const active = current === mode;
        return (
          <button
            key={mode}
            type="button"
            title={label}
            onClick={() => setAppMode(mode)}
            className={cn(
              "flex w-11 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition-colors",
              active
                ? "bg-accent/12 text-accent"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </button>
        );
      })}
    </aside>
  );
}
