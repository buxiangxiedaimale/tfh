import type { AppMode, ViewId } from "@/types";

export function getAppMode(view: ViewId): AppMode {
  if (view === "memo") return "memo";
  if (view === "hot") return "hot";
  return "tasks";
}

export function isTasksView(view: ViewId): boolean {
  return getAppMode(view) === "tasks";
}

export const APP_MODE_LABELS: Record<AppMode, string> = {
  tasks: "待办",
  memo: "小记",
  hot: "热榜",
};
