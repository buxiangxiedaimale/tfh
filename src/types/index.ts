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

export interface InterestCluster {
  name: string;
  score: number;
  keywords: string[];
  examples: string[];
}

export interface InterestProfile {
  total: number;
  positive: number;
  negative: number;
  readLater: number;
  clusters: InterestCluster[];
  updatedAt: string | null;
}

// 结构化用户画像（LLM 生成 + 用户手动覆盖合并后的最终视图）
export type ProfileTagType =
  | "identity"
  | "domain"
  | "style"
  | "avoid";

export interface ProfileDomain {
  name: string;
  weight: number; // 0~1
  subtopics: string[];
}

export interface UserProfile {
  identity: string[]; // 推断身份: 程序员/AI 创业者/...
  domains: ProfileDomain[]; // 兴趣领域 + 权重 + 子话题
  styles: string[]; // 偏好风格: 深度技术解析/教程/八卦/...
  avoid: string[]; // 明确排斥: 明星八卦/政治军事/...
  summary: string; // 一段话总结
  identityInferences?: string[]; // LLM 推断的理由（可选）
  generatedAt: string; // 画像生成时间
  source: "llm" | "fallback"; // 生成方式
  interestCount: number; // 生成时的兴趣样本数
  stats: {
    total: number;
    positive: number;
    negative: number;
    readLater: number;
  };
}

export interface ProfileOverride {
  id: number;
  tagType: ProfileTagType;
  tagValue: string;
  operation: "add" | "remove";
  createdAt: string;
}

// 推荐项多维评分（精排器输出）
export interface FeatureScores {
  domainMatch: number; // 领域匹配
  styleMatch: number; // 风格匹配
  novelty: number; // 新颖度（避免重复曝光）
  quality: number; // 内容质量推断
  llmOverall: number; // LLM 综合分
  baseScore: number; // 粗排基础分
}

export type RecallChannel =
  | "domain"
  | "identity"
  | "style"
  | "freshness"
  | "exploration"
  | "negative_filter";

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
