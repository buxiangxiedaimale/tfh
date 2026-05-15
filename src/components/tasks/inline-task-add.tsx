"use client";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useTodoStore } from "@/store/todo-store";

export function InlineTaskAdd() {
  const addTask = useTodoStore((s) => s.addTask);
  const activeView = useTodoStore((s) => s.activeView);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const projectId = activeView.startsWith("project:")
      ? activeView.slice(8)
      : undefined;
    const dueDate =
      activeView === "today"
        ? new Date().toISOString().slice(0, 10)
        : undefined;
    addTask({ title: trimmed, projectId, dueDate, priority: "none" });
    setTitle("");
    inputRef.current?.focus();
  };

  return (
    <form
      className="mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="relative">
        <Plus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="添加任务，按 Enter 直接保存"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitle("");
              inputRef.current?.blur();
            }
          }}
          className="h-11 border-dashed border-border/80 bg-surface-1/80 pl-10 shadow-none focus:border-accent/40"
        />
      </div>
      <p className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
        需要设置日期、优先级或项目时，请点击右上角 + 或按 Ctrl+K
      </p>
    </form>
  );
}
