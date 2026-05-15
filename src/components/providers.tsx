"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { ServerDataProvider } from "@/components/server-data-provider";
import { useTodoStore } from "@/store/todo-store";

function KeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useTodoStore.getState().setQuickAddOpen(true);
      }
      if (e.key === "Escape") {
        const s = useTodoStore.getState();
        if (s.quickAddOpen) s.setQuickAddOpen(false);
        else if (s.selectedTaskId) s.setSelectedTaskId(null);
        else if (s.sidebarOpen) s.setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <KeyboardShortcuts />
      <ServerDataProvider />
      {children}
    </ThemeProvider>
  );
}
