"use client";

import { Flame, ListTodo, StickyNote } from "lucide-react";
import { getAppMode } from "@/lib/app-mode";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";
import type { AppMode } from "@/types";

const tabs: { mode: AppMode; label: string; icon: typeof ListTodo }[] = [
  { mode: "tasks", label: "待办", icon: ListTodo },
  { mode: "memo", label: "小记", icon: StickyNote },
  { mode: "hot", label: "热榜", icon: Flame },
];

export function BottomNav() {
  const activeView = useTodoStore((s) => s.activeView);
  const setAppMode = useTodoStore((s) => s.setAppMode);
  const selectedTaskId = useTodoStore((s) => s.selectedTaskId);
  const current = getAppMode(activeView);

  if (selectedTaskId) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 md:hidden"
      aria-label="主导航"
    >
      <div className="glass-panel elevated-md mx-auto flex h-[52px] max-w-sm items-stretch justify-around rounded-2xl border border-border/60 px-1">
        {tabs.map(({ mode, label, icon: Icon }) => {
          const active = current === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setAppMode(mode)}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-all duration-200",
                active ? "text-accent" : "text-muted-foreground"
              )}
            >
              {active ? (
                <span className="absolute inset-x-2 inset-y-1.5 rounded-lg bg-accent/10" />
              ) : null}
              <Icon
                className={cn(
                  "relative h-[18px] w-[18px]",
                  active && "stroke-[2.5]"
                )}
              />
              <span className={cn("relative", active && "font-semibold")}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
