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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-1/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="主导航"
    >
      <div className="flex h-14 items-stretch justify-around">
        {tabs.map(({ mode, label, icon: Icon }) => {
          const active = current === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setAppMode(mode)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                active ? "text-accent" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span className={cn(active && "font-medium")}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
