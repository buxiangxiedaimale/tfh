"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTaskWithAI } from "@/lib/ai/parse-task";
import { useTodoStore } from "@/store/todo-store";
import type { Priority } from "@/types";
import { PRIORITY_LABELS } from "@/types";
import { toDateInputValue } from "@/lib/dates";

export function QuickAdd() {
  const { quickAddOpen, setQuickAddOpen, addTask, activeView, projects } =
    useTodoStore();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [projectId, setProjectId] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);

  useEffect(() => {
    if (!quickAddOpen) {
      setTitle("");
      setDueDate("");
      setPriority("none");
      setProjectId("");
      setAiError(null);
      setAiMode(false);
    }
  }, [quickAddOpen]);

  if (!quickAddOpen) return null;

  const defaultProjectId = activeView.startsWith("project:")
    ? activeView.slice(8)
    : undefined;

  const resolveProjectId = (name?: string) => {
    if (!name) return projectId || defaultProjectId;
    const found = projects.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    return found?.id ?? (projectId || defaultProjectId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({
      title: trimmed,
      dueDate:
        dueDate || (activeView === "today" ? toDateInputValue() : undefined),
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
    const pid = resolveProjectId(data.projectName);
    if (pid) setProjectId(pid);
    setAiMode(true);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={() => setQuickAddOpen(false)}
      />
      <div className="fixed left-1/2 top-[10%] z-[70] max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-3xl border border-border/60 bg-surface-1 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">详细添加任务</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQuickAddOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              autoFocus
              placeholder={
                aiMode
                  ? "AI 已解析，可继续编辑后保存"
                  : "例如：明天下午3点高优先级开会"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="pr-24 text-base"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-1 top-1 h-8 gap-1"
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
            <p className="text-xs text-destructive">{aiError}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="flex h-10 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm"
            >
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <select
            value={projectId || defaultProjectId || ""}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex h-10 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm"
          >
            <option value="">无项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuickAddOpen(false)}
            >
              取消
            </Button>
            <Button type="submit">添加任务</Button>
          </div>
        </form>
      </div>
    </>
  );
}
