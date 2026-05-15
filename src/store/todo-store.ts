"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type {
  BoardStatus,
  Memo,
  Priority,
  Project,
  Recurrence,
  Subtask,
  SyncPayload,
  SyncStatus,
  Tag,
  Task,
  AppMode,
  ViewId,
} from "@/types";
import { boardStatusFromCompleted } from "@/types";
import { isDueInUpcoming, isDueToday, isOverdue } from "@/lib/dates";
import { extractTags } from "@/lib/memo/utils";
import { normalizeTask } from "@/lib/sync/merge";

interface TodoState {
  projects: Project[];
  tasks: Task[];
  tags: Tag[];
  activeView: ViewId;
  selectedTaskId: string | null;
  searchQuery: string;
  sidebarOpen: boolean;
  quickAddOpen: boolean;
  calendarMonth: string;
  memos: Memo[];
  memoTagFilter: string | null;
  editingMemoId: string | null;

  syncWorkspaceId: string | null;
  syncVersion: number;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  _syncPaused: boolean;

  setActiveView: (view: ViewId) => void;
  setAppMode: (mode: AppMode) => void;
  setSelectedTaskId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setQuickAddOpen: (open: boolean) => void;
  setCalendarMonth: (month: string) => void;
  setMemoTagFilter: (tag: string | null) => void;
  setEditingMemoId: (id: string | null) => void;

  addMemo: (content: string) => string;
  updateMemo: (id: string, content: string) => void;
  deleteMemo: (id: string) => void;
  toggleMemoPin: (id: string) => void;
  getFilteredMemos: () => Memo[];

  setSyncWorkspaceId: (id: string | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  getSyncPayload: () => SyncPayload;
  hydrateFromRemote: (payload: SyncPayload) => void;
  incrementSyncVersion: () => number;

  addProject: (name: string, color: string) => string;
  updateProject: (id: string, data: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  reorderProjects: (ids: string[]) => void;

  addTask: (data: Partial<Task> & { title: string }) => string;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  setBoardStatus: (id: string, status: BoardStatus) => void;
  reorderTasks: (ids: string[]) => void;
  duplicateTask: (id: string) => string;

  addSubtask: (taskId: string, title: string) => void;
  updateSubtask: (
    taskId: string,
    subtaskId: string,
    data: Partial<Subtask>
  ) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;

  addTag: (name: string, color: string) => string;
  deleteTag: (id: string) => void;

  getFilteredTasks: () => Task[];
  getTaskCount: (view: ViewId) => number;
  getTasksForDate: (date: string) => Task[];
}

const defaultProjects: Project[] = [
  { id: "work", name: "工作", color: "#6366f1", order: 0 },
  { id: "personal", name: "生活", color: "#22c55e", order: 1 },
  { id: "study", name: "学习", color: "#f97316", order: 2 },
];

function seedTasks(): Task[] {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return [
    {
      id: nanoid(),
      title: "欢迎使用 FlowTodo",
      description:
        "支持日历、小记、AI 自然语言添加与多设备同步。配置 .env.local 后启用云端能力。",
      completed: false,
      projectId: "personal",
      priority: "medium",
      dueDate: today,
      tags: [],
      subtasks: [
        { id: nanoid(), title: "探索日历与小记功能", completed: false },
        { id: nanoid(), title: "用 AI 添加：明天下午开会", completed: false },
      ],
      recurrence: "none",
      boardStatus: "todo",
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nanoid(),
      title: "规划本周目标",
      completed: false,
      projectId: "work",
      priority: "high",
      dueDate: tomorrow,
      tags: [],
      subtasks: [],
      recurrence: "none",
      boardStatus: "in_progress",
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function matchesView(task: Task, view: ViewId): boolean {
  if (view === "calendar") return !task.completed;
  if (task.completed && view !== "completed") return false;
  if (!task.completed && view === "completed") return true;

  switch (view) {
    case "inbox":
      return !task.projectId && !task.dueDate;
    case "today":
      return isDueToday(task.dueDate) || isOverdue(task.dueDate);
    case "upcoming":
      return isDueInUpcoming(task.dueDate);
    case "all":
      return true;
    case "completed":
      return task.completed;
    default:
      if (view.startsWith("project:")) {
        return task.projectId === view.slice(8);
      }
      return true;
  }
}

function matchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    task.title.toLowerCase().includes(q) ||
    (task.description?.toLowerCase().includes(q) ?? false) ||
    task.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function seedMemos(): Memo[] {
  const now = new Date().toISOString();
  return [
    {
      id: nanoid(),
      content:
        "欢迎使用小记 ✨\n\n像 flomo 一样随时记录灵感，用 #标签 分类。\n\n例如：#想法 多端同步后，手机电脑都能看到这条笔记。",
      tags: ["想法", "标签"],
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export const useTodoStore = create<TodoState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        projects: defaultProjects,
        tasks: seedTasks(),
        tags: [],
        activeView: "today",
        selectedTaskId: null,
        searchQuery: "",
        sidebarOpen: false,
        quickAddOpen: false,
        calendarMonth: currentMonth(),
        memos: seedMemos(),
        memoTagFilter: null,
        editingMemoId: null,

        syncWorkspaceId: null,
        syncVersion: 1,
        syncStatus: "offline",
        lastSyncedAt: null,
        _syncPaused: false,

        setActiveView: (view) =>
          set({ activeView: view, selectedTaskId: null, sidebarOpen: false }),

        setAppMode: (mode) => {
          const { activeView } = get();
          if (mode === "memo") {
            set({ activeView: "memo", selectedTaskId: null, sidebarOpen: false });
            return;
          }
          if (mode === "hot") {
            set({ activeView: "hot", selectedTaskId: null, sidebarOpen: false });
            return;
          }
          if (activeView === "memo" || activeView === "hot") {
            set({ activeView: "today", selectedTaskId: null, sidebarOpen: false });
          } else {
            set({ selectedTaskId: null, sidebarOpen: false });
          }
        },
        setSelectedTaskId: (id) => set({ selectedTaskId: id }),
        setSearchQuery: (q) => set({ searchQuery: q }),
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        setQuickAddOpen: (open) => set({ quickAddOpen: open }),
        setCalendarMonth: (month) => set({ calendarMonth: month }),
        setMemoTagFilter: (tag) => set({ memoTagFilter: tag }),
        setEditingMemoId: (id) => set({ editingMemoId: id }),

        addMemo: (content) => {
          const trimmed = content.trim();
          const id = nanoid();
          const now = new Date().toISOString();
          const memo: Memo = {
            id,
            content: trimmed,
            tags: extractTags(trimmed),
            pinned: false,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ memos: [memo, ...s.memos] }));
          get().incrementSyncVersion();
          return id;
        },

        updateMemo: (id, content) => {
          const trimmed = content.trim();
          set((s) => ({
            memos: s.memos.map((m) =>
              m.id === id
                ? {
                    ...m,
                    content: trimmed,
                    tags: extractTags(trimmed),
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
          }));
          get().incrementSyncVersion();
        },

        deleteMemo: (id) => {
          set((s) => ({
            memos: s.memos.filter((m) => m.id !== id),
            editingMemoId:
              s.editingMemoId === id ? null : s.editingMemoId,
          }));
          get().incrementSyncVersion();
        },

        toggleMemoPin: (id) => {
          set((s) => ({
            memos: s.memos.map((m) =>
              m.id === id
                ? {
                    ...m,
                    pinned: !m.pinned,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
          }));
          get().incrementSyncVersion();
        },

        getFilteredMemos: () => {
          const { memos, memoTagFilter, searchQuery } = get();
          return memos.filter((m) => {
            if (memoTagFilter && !m.tags.includes(memoTagFilter)) return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
              m.content.toLowerCase().includes(q) ||
              m.tags.some((t) => t.includes(q))
            );
          });
        },

        setSyncWorkspaceId: (id) =>
          set({ syncWorkspaceId: id, syncStatus: id ? "connecting" : "offline" }),
        setSyncStatus: (status) => set({ syncStatus: status }),

        getSyncPayload: () => ({
          projects: get().projects,
          tasks: get().tasks,
          tags: get().tags,
          memos: get().memos,
          version: get().syncVersion,
        }),

        hydrateFromRemote: (payload) => {
          set({
            _syncPaused: true,
            projects: payload.projects,
            tasks: payload.tasks.map(normalizeTask),
            tags: payload.tags,
            memos: payload.memos ?? [],
            syncVersion: payload.version,
            lastSyncedAt: new Date().toISOString(),
            syncStatus: "synced",
          });
          setTimeout(() => set({ _syncPaused: false }), 100);
        },

        incrementSyncVersion: () => {
          const next = get().syncVersion + 1;
          set({ syncVersion: next });
          return next;
        },

        addProject: (name, color) => {
          const id = nanoid();
          const order = get().projects.length;
          set((s) => ({
            projects: [...s.projects, { id, name, color, order }],
          }));
          get().incrementSyncVersion();
          return id;
        },

        updateProject: (id, data) => {
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === id ? { ...p, ...data } : p
            ),
          }));
          get().incrementSyncVersion();
        },

        deleteProject: (id) => {
          set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            tasks: s.tasks.map((t) =>
              t.projectId === id ? { ...t, projectId: undefined } : t
            ),
            activeView:
              s.activeView === `project:${id}` ? "today" : s.activeView,
          }));
          get().incrementSyncVersion();
        },

        reorderProjects: (ids) => {
          set((s) => ({
            projects: ids
              .map((id, order) => {
                const p = s.projects.find((x) => x.id === id);
                return p ? { ...p, order } : null;
              })
              .filter(Boolean) as Project[],
          }));
          get().incrementSyncVersion();
        },

        addTask: (data) => {
          const id = nanoid();
          const now = new Date().toISOString();
          const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order));
          const completed = data.completed ?? false;
          const boardStatus =
            data.boardStatus ??
            boardStatusFromCompleted(completed);
          const task: Task = {
            id,
            title: data.title,
            description: data.description,
            completed,
            completedAt: data.completedAt,
            projectId: data.projectId,
            priority: data.priority ?? "none",
            dueDate: data.dueDate,
            dueTime: data.dueTime,
            tags: data.tags ?? [],
            subtasks: data.subtasks ?? [],
            recurrence: data.recurrence ?? "none",
            boardStatus,
            order: maxOrder + 1,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ tasks: [...s.tasks, task], selectedTaskId: id }));
          get().incrementSyncVersion();
          return id;
        },

        updateTask: (id, data) => {
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.id !== id) return t;
              const next = { ...t, ...data, updatedAt: new Date().toISOString() };
              if (data.completed !== undefined) {
                next.boardStatus = boardStatusFromCompleted(data.completed);
              }
              return next;
            }),
          }));
          get().incrementSyncVersion();
        },

        deleteTask: (id) => {
          set((s) => ({
            tasks: s.tasks.filter((t) => t.id !== id),
            selectedTaskId:
              s.selectedTaskId === id ? null : s.selectedTaskId,
          }));
          get().incrementSyncVersion();
        },

        toggleTask: (id) => {
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.id !== id) return t;
              const completed = !t.completed;
              return {
                ...t,
                completed,
                boardStatus: boardStatusFromCompleted(completed),
                completedAt: completed
                  ? new Date().toISOString()
                  : undefined,
                updatedAt: new Date().toISOString(),
              };
            }),
          }));
          get().incrementSyncVersion();
        },

        setBoardStatus: (id, status) => {
          const completed = status === "done";
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    boardStatus: status,
                    completed,
                    completedAt: completed
                      ? new Date().toISOString()
                      : undefined,
                    updatedAt: new Date().toISOString(),
                  }
                : t
            ),
          }));
          get().incrementSyncVersion();
        },

        reorderTasks: (ids) => {
          set((s) => ({
            tasks: s.tasks.map((t) => {
              const order = ids.indexOf(t.id);
              return order >= 0 ? { ...t, order } : t;
            }),
          }));
          get().incrementSyncVersion();
        },

        duplicateTask: (id) => {
          const source = get().tasks.find((t) => t.id === id);
          if (!source) return id;
          return get().addTask({
            ...source,
            title: `${source.title}（副本）`,
            completed: false,
            boardStatus: "todo",
            subtasks: source.subtasks.map((st) => ({
              ...st,
              id: nanoid(),
              completed: false,
            })),
          });
        },

        addSubtask: (taskId, title) => {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    subtasks: [
                      ...t.subtasks,
                      { id: nanoid(), title, completed: false },
                    ],
                    updatedAt: new Date().toISOString(),
                  }
                : t
            ),
          }));
          get().incrementSyncVersion();
        },

        updateSubtask: (taskId, subtaskId, data) => {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    subtasks: t.subtasks.map((st) =>
                      st.id === subtaskId ? { ...st, ...data } : st
                    ),
                    updatedAt: new Date().toISOString(),
                  }
                : t
            ),
          }));
          get().incrementSyncVersion();
        },

        deleteSubtask: (taskId, subtaskId) => {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    subtasks: t.subtasks.filter((st) => st.id !== subtaskId),
                    updatedAt: new Date().toISOString(),
                  }
                : t
            ),
          }));
          get().incrementSyncVersion();
        },

        addTag: (name, color) => {
          const id = nanoid();
          set((s) => ({ tags: [...s.tags, { id, name, color }] }));
          get().incrementSyncVersion();
          return id;
        },

        deleteTag: (id) => {
          set((s) => ({
            tags: s.tags.filter((t) => t.id !== id),
            tasks: s.tasks.map((t) => ({
              ...t,
              tags: t.tags.filter((name) => {
                const tag = s.tags.find((x) => x.id === id);
                return tag ? name !== tag.name : true;
              }),
            })),
          }));
          get().incrementSyncVersion();
        },

        getFilteredTasks: () => {
          const { tasks, activeView, searchQuery } = get();
          return tasks
            .filter((t) => matchesView(t, activeView))
            .filter((t) => matchesSearch(t, searchQuery))
            .sort((a, b) => {
              if (activeView === "completed") {
                const bTime = new Date(b.completedAt ?? b.updatedAt).getTime();
                const aTime = new Date(a.completedAt ?? a.updatedAt).getTime();
                return bTime - aTime;
              }
              return a.order - b.order;
            });
        },

        getTaskCount: (view) => {
          const { tasks, searchQuery } = get();
          return tasks.filter(
            (t) =>
              !t.completed &&
              matchesView({ ...t, completed: false }, view) &&
              matchesSearch(t, searchQuery)
          ).length;
        },

        getTasksForDate: (date) => {
          const { tasks, searchQuery } = get();
          return tasks
            .filter((t) => t.dueDate === date)
            .filter((t) => matchesSearch(t, searchQuery))
            .sort((a, b) => a.order - b.order);
        },
      }),
      {
        name: "flowtodo-storage-v2",
        partialize: (s) => ({
          projects: s.projects,
          tasks: s.tasks,
          tags: s.tags,
          activeView: s.activeView,
          calendarMonth: s.calendarMonth,
          syncWorkspaceId: s.syncWorkspaceId,
          syncVersion: s.syncVersion,
          memos: s.memos,
        }),
      }
    )
  )
);

export type { Priority, Recurrence, BoardStatus };
