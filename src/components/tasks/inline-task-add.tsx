"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTodoStore } from "@/store/todo-store";

export function InlineTaskAdd() {
  const addTask = useTodoStore((s) => s.addTask);
  const activeView = useTodoStore((s) => s.activeView);
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);

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
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:bg-surface-2 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        添加任务…
      </button>
    );
  }

  return (
    <form
      className="mb-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        autoFocus
        placeholder="任务标题，Enter 添加"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTitle("");
            setExpanded(false);
          }
        }}
        onBlur={() => {
          if (!title.trim()) setExpanded(false);
        }}
        className="h-10 flex-1"
      />
      <Button type="submit" disabled={!title.trim()}>
        添加
      </Button>
    </form>
  );
}
