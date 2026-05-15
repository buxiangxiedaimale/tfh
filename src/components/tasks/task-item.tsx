"use client";

import { Calendar, Flag, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDueDate, isOverdue } from "@/lib/dates";
import { useTodoStore } from "@/store/todo-store";
import type { Task } from "@/types";

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const { toggleTask, setSelectedTaskId, selectedTaskId, projects } =
    useTodoStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const project = projects.find((p) => p.id === task.projectId);
  const dueLabel = formatDueDate(task.dueDate);
  const overdue = !task.completed && isOverdue(task.dueDate);
  const selected = selectedTaskId === task.id;
  const subtaskDone = task.subtasks.filter((s) => s.completed).length;
  const subtaskTotal = task.subtasks.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group elevated mb-2 flex items-start gap-2.5 rounded-2xl border border-border/50 bg-surface-1 px-3 py-3 transition-all duration-200",
        selected && "border-accent/40 bg-accent-muted ring-1 ring-accent/20",
        !selected && "hover:border-border hover:shadow-md",
        isDragging && "z-10 scale-[1.01] opacity-90 shadow-lg"
      )}
    >
      <button
        type="button"
        className="mt-0.5 cursor-grab touch-none text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100 active:cursor-grabbing md:opacity-0"
        {...attributes}
        {...listeners}
        aria-label="拖动排序"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Checkbox
        checked={task.completed}
        onChange={() => toggleTask(task.id)}
        priority={task.priority}
      />

      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => setSelectedTaskId(task.id)}
      >
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            task.completed && "text-muted-foreground line-through"
          )}
        >
          {task.title}
        </p>

        {(dueLabel || project || subtaskTotal > 0 || task.priority !== "none") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {dueLabel && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs",
                  overdue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                <Calendar className="h-3 w-3" />
                {dueLabel}
              </span>
            )}
            {project && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                {project.name}
              </span>
            )}
            {subtaskTotal > 0 && (
              <span className="text-xs text-muted-foreground">
                {subtaskDone}/{subtaskTotal}
              </span>
            )}
            {task.priority !== "none" && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs",
                  task.priority === "high" && "text-priority-high",
                  task.priority === "medium" && "text-priority-medium",
                  task.priority === "low" && "text-priority-low"
                )}
              >
                <Flag className="h-3 w-3" />
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
