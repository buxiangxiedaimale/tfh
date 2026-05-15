"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { ListTodo } from "lucide-react";
import { useMemo } from "react";
import { InlineTaskAdd } from "@/components/tasks/inline-task-add";
import { TaskItem } from "@/components/tasks/task-item";
import { useTodoStore } from "@/store/todo-store";

const viewTitles: Record<string, string> = {
  inbox: "收集箱",
  today: "今天",
  upcoming: "即将到期",
  all: "全部任务",
  completed: "已完成",
};

export function TaskList() {
  const { getFilteredTasks, reorderTasks, activeView, projects } =
    useTodoStore();
  const tasks = getFilteredTasks();

  const title = useMemo(() => {
    if (activeView.startsWith("project:")) {
      const id = activeView.slice(8);
      return projects.find((p) => p.id === id)?.name ?? "项目";
    }
    return viewTitles[activeView] ?? "任务";
  }, [activeView, projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = tasks.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...ids];
    const [removed] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, removed);
    reorderTasks(next);
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="hidden shrink-0 border-b border-border/60 px-4 py-6 sm:px-8 lg:block">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tasks.length} 个任务
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-8">
        <InlineTaskAdd />
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="elevated mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-1">
              <ListTodo className="h-8 w-8 text-accent/60" />
            </div>
            <p className="text-lg font-medium">暂无任务</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              在上方输入后点「添加」；设置日期等请点右上角 +
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence mode="popLayout">
                {tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    <TaskItem task={task} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
