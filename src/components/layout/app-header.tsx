"use client";

import { Menu, Plus, Search } from "lucide-react";
import { APP_MODE_LABELS, getAppMode, isTasksView } from "@/lib/app-mode";
import { Button } from "@/components/ui/button";
import { useTodoStore } from "@/store/todo-store";

const taskTitles: Record<string, string> = {
  inbox: "收集箱",
  today: "今天",
  upcoming: "即将到期",
  calendar: "日历",
  all: "全部任务",
  completed: "已完成",
};

export function AppHeader() {
  const {
    activeView,
    projects,
    selectedTaskId,
    setSidebarOpen,
    setQuickAddOpen,
  } = useTodoStore();

  if (selectedTaskId) return null;

  const mode = getAppMode(activeView);
  let title = APP_MODE_LABELS[mode];
  if (isTasksView(activeView)) {
    if (activeView.startsWith("project:")) {
      const id = activeView.slice(8);
      title = projects.find((p) => p.id === id)?.name ?? "项目";
    } else {
      title = taskTitles[activeView] ?? "待办";
    }
  }

  const showTaskActions = mode === "tasks";

  return (
    <header className="glass-panel flex items-center gap-2 border-b border-border/60 px-3 py-2.5 lg:hidden">
      {showTaskActions ? (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </Button>
      ) : (
        <span className="w-9 shrink-0" />
      )}

      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
        {title}
      </h1>

      {showTaskActions ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="搜索与更多"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            onClick={() => setQuickAddOpen(true)}
            aria-label="详细添加任务（日期、优先级等）"
            title="详细添加"
            className="shadow-sm"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
    </header>
  );
}
