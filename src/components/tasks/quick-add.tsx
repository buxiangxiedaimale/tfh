"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTaskWithAI } from "@/lib/ai/parse-task";
import {
  getViewTaskDefaults,
  resolveProjectId,
  taskFromPlainText,
} from "@/lib/tasks/quick-create";
import { useTodoStore } from "@/store/todo-store";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";
import { PRIORITY_LABELS } from "@/types";
import { toDateInputValue } from "@/lib/dates";

export function QuickAdd() {
  const { setQuickAddOpen, addTask, activeView, projects } = useTodoStore();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [projectId, setProjectId] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);

  const { projectId: defaultProjectId, dueDate: viewDueDate } =
    getViewTaskDefaults(activeView);

  const resolveProject = (name?: string) =>
    resolveProjectId(projects, name, projectId || defaultProjectId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({
      ...taskFromPlainText(trimmed, activeView),
      dueDate:
        dueDate || viewDueDate || (activeView === "today" ? toDateInputValue() : undefined),
      priority,
      projectId: projectId || defaultProjectId,
    });
    setQuickAddOpen(false);
  };

  const handleAiParse = async () => {
    const text = title.trim();
    if (!text) {
      setAiError("请先输入自然语言描述");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    const { data, error } = await parseTaskWithAI(text);
    setAiLoading(false);
    if (error || !data) {
      setAiError(error ?? "解析失败");
      return;
    }
    setTitle(data.title);
    if (data.dueDate) setDueDate(data.dueDate);
    if (data.priority) setPriority(data.priority);
    const pid = resolveProject(data.projectName);
    if (pid) setProjectId(pid);
    setAiMode(true);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={() => setQuickAddOpen(false)}
      />
      <div
        className={cn(
          "fixed z-[70] flex flex-col overflow-hidden bg-surface-1 shadow-2xl",
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl border-t border-border/60 pb-[env(safe-area-inset-bottom)]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[10%] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:rounded-3xl sm:border sm:pb-0"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-3.5 sm:border-b-0 sm:px-6 sm:pb-2 sm:pt-5">
          <h3 className="text-base font-semibold sm:text-lg">
            详细添加任务
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2"
            onClick={() => setQuickAddOpen(false)}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5"
        >
          <div className="relative">
            <Input
              autoFocus
              placeholder={
                aiMode
                  ? "AI 已解析，可继续编辑后保存"
                  : "例如：明天下午 3 点高优先级开会"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 pr-24 text-base"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 gap-1 px-3"
              onClick={handleAiParse}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              AI
            </Button>
          </div>

          {aiError && (
            <p className="-mt-2 text-xs text-destructive">{aiError}</p>
          )}
          {aiMode && !aiError && (
            <p className="-mt-2 flex items-center gap-1 text-xs text-accent">
              <Sparkles className="h-3 w-3" />
              AI 已为你填好字段，调整后保存即可
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                日期
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                优先级
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="flex h-11 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              项目
            </label>
            <select
              value={projectId || defaultProjectId || ""}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <option value="">无项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col-reverse gap-2 border-t border-border/60 bg-surface-1 px-5 py-3 sm:static sm:mx-0 sm:mt-2 sm:flex-row sm:justify-end sm:border-0 sm:p-0">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setQuickAddOpen(false)}
              className="sm:size-default"
            >
              取消
            </Button>
            <Button type="submit" size="lg" className="sm:size-default">
              添加任务
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
