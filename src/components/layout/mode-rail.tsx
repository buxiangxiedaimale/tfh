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
      className="glass-panel hidden w-[68px] shrink-0 flex-col items-center gap-2 border-r border-border/60 py-5 md:flex"
      aria-label="模块切换"
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-400 text-sm font-bold text-white shadow-md">
        F
      </div>
      <div className="flex w-full flex-col items-center gap-1 px-2">
        {modes.map(({ mode, label, icon: Icon }) => {
          const active = current === mode;
          return (
            <button
              key={mode}
              type="button"
              title={label}
              onClick={() => setAppMode(mode)}
              className={cn(
                "relative flex w-full flex-col items-center gap-0.5 rounded-xl py-2.5 text-[10px] transition-all duration-200",
                active
                  ? "text-accent"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              )}
            >
              {active ? (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />
              ) : null}
              <Icon className="relative h-5 w-5" />
              <span className="relative font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
