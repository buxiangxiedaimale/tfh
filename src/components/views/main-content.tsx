"use client";

import { useEffect } from "react";
import { HotView } from "@/components/hot/hot-view";
import { MemoView } from "@/components/memo/memo-view";
import { TaskList } from "@/components/tasks/task-list";
import { CalendarView } from "@/components/views/calendar-view";
import { useTodoStore } from "@/store/todo-store";

export function MainContent() {
  const activeView = useTodoStore((s) => s.activeView);

  useEffect(() => {
    if ((activeView as string) === "kanban") {
      useTodoStore.getState().setActiveView("today");
    }
  }, [activeView]);

  if ((activeView as string) === "kanban") return <TaskList />;

  if (activeView === "hot") return <HotView />;
  if (activeView === "memo") return <MemoView />;
  if (activeView === "calendar") return <CalendarView />;
  return <TaskList />;
}
