"use client";

import { Loader2, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTaskWithAI } from "@/lib/ai/parse-task";
import {
  taskFromParsedIntent,
  taskFromPlainText,
} from "@/lib/tasks/quick-create";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";

export function InlineTaskAdd() {
  const addTask = useTodoStore((s) => s.addTask);
  const setSelectedTaskId = useTodoStore((s) => s.setSelectedTaskId);
  const activeView = useTodoStore((s) => s.activeView);
  const projects = useTodoStore((s) => s.projects);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((j: { configured?: boolean }) => setAiConfigured(Boolean(j.configured)))
      .catch(() => setAiConfigured(false));
  }, []);

  const addQuickTodayTask = (data: Parameters<typeof addTask>[0]) => {
    addTask({
      ...data,
      dueDate: new Date().toISOString().slice(0, 10),
    });
    setSelectedTaskId(null);
    setTitle("");
    inputRef.current?.focus();
  };

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setHint(null);

    try {
      if (aiConfigured) {
        const { data, error } = await parseTaskWithAI(trimmed);
        if (data?.title?.trim()) {
          addQuickTodayTask(taskFromParsedIntent(data, activeView, projects));
          return;
        }
        if (
          error &&
          (error.includes("未配置") || error.includes("DEEPSEEK"))
        ) {
          setAiConfigured(false);
          addQuickTodayTask(taskFromPlainText(trimmed, activeView));
          return;
        }
        if (error) {
          addQuickTodayTask(taskFromPlainText(trimmed, activeView));
          setHint("AI 解析失败，已按原文添加");
          return;
        }
      }

      addQuickTodayTask(taskFromPlainText(trimmed, activeView));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder={
              aiConfigured
                ? "快捷添加，如：明天下午开会"
                : "快捷添加任务"
            }
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (hint) setHint(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setTitle("");
                setHint(null);
                inputRef.current?.blur();
              }
            }}
            disabled={loading}
            className="h-11 border-dashed border-border/80 bg-surface-1/80 pl-9 shadow-none focus:border-accent/40"
          />
        </div>
        <Button
          type="submit"
          disabled={!title.trim() || loading}
          className={cn(
            "h-11 shrink-0 gap-1.5 px-4",
            aiConfigured && "min-w-[5.5rem]"
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : aiConfigured ? (
            <Sparkles className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {loading ? "…" : "添加"}
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {hint ? (
          <span className="text-amber-600 dark:text-amber-400">{hint}</span>
        ) : aiConfigured ? (
          <>点击「添加」直接生成今天任务；详细设置请点右上角 +</>
        ) : (
          <>点击「添加」直接生成今天任务；详细设置请点右上角 +</>
        )}
      </p>
    </div>
  );
}
