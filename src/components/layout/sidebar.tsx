"use client";

import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  Inbox,
  LayoutList,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";
import type { ViewId } from "@/types";
import { PROJECT_COLORS } from "@/types";

const mainNav: { id: ViewId; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "收集箱", icon: Inbox },
  { id: "today", label: "今天", icon: Sun },
  { id: "upcoming", label: "即将到期", icon: CalendarDays },
  { id: "calendar", label: "日历", icon: Calendar },
  { id: "all", label: "全部任务", icon: LayoutList },
  { id: "completed", label: "已完成", icon: CheckCircle2 },
];

export function Sidebar() {
  const {
    activeView,
    setActiveView,
    projects,
    addProject,
    searchQuery,
    setSearchQuery,
    getTaskCount,
    setQuickAddOpen,
  } = useTodoStore();
  const { theme, setTheme } = useTheme();
  const [newProject, setNewProject] = useState(false);
  const [projectName, setProjectName] = useState("");

  const handleAddProject = () => {
    const name = projectName.trim();
    if (!name) return;
    const color =
      PROJECT_COLORS[projects.length % PROJECT_COLORS.length] ?? "#6366f1";
    addProject(name, color);
    setProjectName("");
    setNewProject(false);
  };

  return (
    <aside className="glass-panel flex h-full w-[280px] shrink-0 flex-col border-r border-border/60">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-indigo-400 text-white shadow-md">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">FlowTodo</h1>
          <p className="text-xs text-muted-foreground">专注每一刻</p>
        </div>
      </div>

      <div className="px-3 pb-2">
          <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索任务..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 border-transparent bg-surface-2/80 pl-9 shadow-none focus:border-accent/30"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          智能列表
        </p>
        {mainNav.map(({ id, label, icon: Icon }) => {
          const count = getTaskCount(id);
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-accent-muted text-accent font-medium shadow-sm"
                  : "text-foreground/80 hover:bg-surface-2/80"
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px]",
                  active ? "text-accent" : "text-muted-foreground"
                )}
              />
              <span className="flex-1 text-left">{label}</span>
              {count > 0 && id !== "completed" && (
                <span
                  className={cn(
                    "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs",
                    active
                      ? "bg-accent/20 text-accent"
                      : "bg-surface-3 text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <div className="mt-4 flex items-center justify-between px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            项目
          </p>
          <button
            type="button"
            onClick={() => setNewProject(true)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="新建项目"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {newProject && (
          <div className="mb-2 flex gap-1 px-2">
            <Input
              autoFocus
              placeholder="项目名称"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddProject();
                if (e.key === "Escape") setNewProject(false);
              }}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={handleAddProject}>
              添加
            </Button>
          </div>
        )}

        {projects.map((project) => {
          const viewId: ViewId = `project:${project.id}`;
          const active = activeView === viewId;
          const count = getTaskCount(viewId);
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setActiveView(viewId)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-accent-muted font-medium text-accent shadow-sm"
                  : "text-foreground/80 hover:bg-surface-2/80"
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <span className="flex-1 truncate text-left">{project.name}</span>
              {count > 0 && (
                <span className="text-xs text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border/60 p-3">
        <Button className="w-full" onClick={() => setQuickAddOpen(true)}>
          <Plus className="h-4 w-4" />
          新建任务
          <kbd className="ml-auto hidden rounded bg-accent-foreground/20 px-1.5 py-0.5 text-[10px] sm:inline">
            Ctrl+K
          </kbd>
        </Button>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {theme === "dark" ? "浅色模式" : "深色模式"}
        </button>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
