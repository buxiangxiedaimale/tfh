"use client";

import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ModeRail } from "@/components/layout/mode-rail";
import { Sidebar } from "@/components/layout/sidebar";
import { TaskNavChips } from "@/components/layout/task-nav-chips";
import { MainContent } from "@/components/views/main-content";
import { TaskDetail } from "@/components/tasks/task-detail";
import { QuickAdd } from "@/components/tasks/quick-add";
import { isTasksView } from "@/lib/app-mode";
import { cn } from "@/lib/utils";
import { useTodoStore } from "@/store/todo-store";

export function AppShell() {
  const {
    sidebarOpen,
    setSidebarOpen,
    selectedTaskId,
    activeView,
    quickAddOpen,
  } = useTodoStore();

  const tasksMode = isTasksView(activeView);
  const showTaskDetail = selectedTaskId && tasksMode;

  return (
    <div className="app-canvas flex h-[100dvh] overflow-hidden">
      <ModeRail />

      {tasksMode ? (
        <>
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:left-[68px] lg:static lg:translate-x-0",
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <Sidebar />
          </div>

          {sidebarOpen ? (
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}
        </>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <AppHeader />
        {tasksMode ? <TaskNavChips /> : null}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <MainContent />
          {showTaskDetail ? <TaskDetail key={selectedTaskId} /> : null}
        </div>
      </main>

      <BottomNav />
      {quickAddOpen ? <QuickAdd /> : null}
    </div>
  );
}
