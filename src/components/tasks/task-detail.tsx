"use client";

import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Copy,
  Flag,
  Folder,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";
import type { Priority, Recurrence } from "@/types";
import { PRIORITY_LABELS } from "@/types";

export function TaskDetail() {
  const {
    selectedTaskId,
    setSelectedTaskId,
    tasks,
    projects,
    updateTask,
    deleteTask,
    duplicateTask,
    addSubtask,
    updateSubtask,
    deleteSubtask,
    toggleTask,
  } = useTodoStore();

  const task = tasks.find((t) => t.id === selectedTaskId);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  if (!task) return null;

  const handleAddSubtask = () => {
    const title = subtaskInput.trim();
    if (!title) return;
    addSubtask(task.id, title);
    setSubtaskInput("");
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        onClick={() => setSelectedTaskId(null)}
        aria-hidden
      />
      <aside className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl border-t border-border bg-surface-1 shadow-2xl lg:static lg:inset-auto lg:z-auto lg:h-full lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 lg:hidden"
            onClick={() => setSelectedTaskId(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            任务详情
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedTaskId(null)}
              aria-label="关闭详情"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section className="rounded-2xl border border-border/70 bg-surface-1 p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={task.completed}
                onChange={() => toggleTask(task.id)}
                priority={task.priority}
                className="mt-1"
              />
              <Input
                value={task.title}
                onChange={(e) =>
                  updateTask(task.id, { title: e.target.value })
                }
                className="min-h-10 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              />
            </div>
          </section>

          <section>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              备注
            </label>
            <textarea
              value={task.description ?? ""}
              onChange={(e) =>
                updateTask(task.id, { description: e.target.value })
              }
              placeholder="添加备注，记录上下文..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-border/70 bg-surface-2/70 px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </section>

          <section className="grid gap-3">
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                日期
              </label>
              <Input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) =>
                  updateTask(task.id, {
                    dueDate: e.target.value || undefined,
                  })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Folder className="h-3.5 w-3.5" />
                  项目
                </label>
                <select
                  value={task.projectId ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, {
                      projectId: e.target.value || undefined,
                    })
                  }
                  className="flex h-10 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <option value="">无项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />
                  优先级
                </label>
                <select
                  value={task.priority}
                  onChange={(e) =>
                    updateTask(task.id, {
                      priority: e.target.value as Priority,
                    })
                  }
                  className="flex h-10 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-surface-1">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
              onClick={() => setMoreOpen((open) => !open)}
            >
              更多设置
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  moreOpen && "rotate-180"
                )}
              />
            </button>

            {moreOpen ? (
              <div className="space-y-5 border-t border-border/60 p-4">
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Repeat className="h-3.5 w-3.5" />
                    重复
                  </label>
                  <select
                    value={task.recurrence}
                    onChange={(e) =>
                      updateTask(task.id, {
                        recurrence: e.target.value as Recurrence,
                      })
                    }
                    className="flex h-10 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <option value="none">不重复</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                  </select>
                </div>

                <div>
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    子任务
                  </label>
                  <ul className="space-y-1">
                    {task.subtasks.map((st) => (
                      <li
                        key={st.id}
                        className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2"
                      >
                        <Checkbox
                          checked={st.completed}
                          onChange={() =>
                            updateSubtask(task.id, st.id, {
                              completed: !st.completed,
                            })
                          }
                        />
                        <input
                          value={st.title}
                          onChange={(e) =>
                            updateSubtask(task.id, st.id, {
                              title: e.target.value,
                            })
                          }
                          className={cn(
                            "flex-1 bg-transparent text-sm outline-none",
                            st.completed &&
                              "text-muted-foreground line-through"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => deleteSubtask(task.id, st.id)}
                          className="text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                          aria-label="删除子任务"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="添加子任务..."
                      value={subtaskInput}
                      onChange={(e) => setSubtaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddSubtask();
                      }}
                      className="h-9"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAddSubtask}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => duplicateTask(task.id)}
                    className="justify-start"
                  >
                    <Copy className="h-4 w-4" />
                    复制
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      deleteTask(task.id);
                      setSelectedTaskId(null);
                    }}
                    className="justify-start"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  创建于{" "}
                  {format(new Date(task.createdAt), "yyyy年M月d日 HH:mm")}
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </aside>
    </>
  );
}
