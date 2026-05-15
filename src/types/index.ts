export type Priority = "none" | "low" | "medium" | "high";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";
export type BoardStatus = "todo" | "in_progress" | "done";

export type AppMode = "tasks" | "memo" | "hot";

export type ViewId =
  | "inbox"
  | "today"
  | "upcoming"
  | "all"
  | "completed"
  | "calendar"
  | "memo"
  | "hot"
  | `project:${string}`;

export interface Memo {
  id: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
  projectId?: string;
  priority: Priority;
  dueDate?: string;
  dueTime?: string;
  tags: string[];
  subtasks: Subtask[];
  recurrence: Recurrence;
  boardStatus: BoardStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export type SyncStatus =
  | "offline"
  | "connecting"
  | "synced"
  | "syncing"
  | "error";

export interface SyncPayload {
  projects: Project[];
  tasks: Task[];
  tags: Tag[];
  memos: Memo[];
  version: number;
}

export type InterestKind = "positive" | "negative" | "read_later";

export interface InterestItem {
  id: string;
  kind: InterestKind;
  title: string;
  url?: string;
  source?: string;
  heat?: string;
  keywords: string[];
  embeddingKey?: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface HotRecommendation {
  itemKey: string;
  score: number;
  reason: string;
  matchedInterests: string[];
}

export const BOARD_COLUMNS: {
  id: BoardStatus;
  label: string;
}[] = [
  { id: "todo", label: "待办" },
  { id: "in_progress", label: "进行中" },
  { id: "done", label: "已完成" },
];

export const PROJECT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#64748b",
] as const;

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: "无",
  low: "低",
  medium: "中",
  high: "高",
};

export function boardStatusFromCompleted(completed: boolean): BoardStatus {
  return completed ? "done" : "todo";
}
