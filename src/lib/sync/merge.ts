import type { Memo, Project, SyncPayload, Task } from "@/types";
import { boardStatusFromCompleted } from "@/types";

export function mergeTasks(local: Task[], remote: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of local) map.set(t.id, t);
  for (const rt of remote) {
    const lt = map.get(rt.id);
    if (!lt) {
      map.set(rt.id, normalizeTask(rt));
      continue;
    }
    const ltTime = new Date(lt.updatedAt).getTime();
    const rtTime = new Date(rt.updatedAt).getTime();
    map.set(rt.id, rtTime >= ltTime ? normalizeTask(rt) : lt);
  }
  return Array.from(map.values());
}

export function mergeProjects(local: Project[], remote: Project[]): Project[] {
  const map = new Map<string, Project>();
  for (const p of local) map.set(p.id, p);
  for (const rp of remote) {
    const lp = map.get(rp.id);
    if (!lp) map.set(rp.id, rp);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

export function normalizeTask(task: Task): Task {
  return {
    ...task,
    boardStatus:
      task.boardStatus ?? boardStatusFromCompleted(task.completed),
    tags: task.tags ?? [],
    subtasks: task.subtasks ?? [],
  };
}

export function mergeMemos(local: Memo[], remote: Memo[]): Memo[] {
  const map = new Map<string, Memo>();
  for (const m of local) map.set(m.id, m);
  for (const rm of remote) {
    const lm = map.get(rm.id);
    if (!lm) {
      map.set(rm.id, { ...rm, tags: rm.tags ?? [] });
      continue;
    }
    const ltTime = new Date(lm.updatedAt).getTime();
    const rtTime = new Date(rm.updatedAt).getTime();
    map.set(rm.id, rtTime >= ltTime ? { ...rm, tags: rm.tags ?? [] } : lm);
  }
  return Array.from(map.values());
}

export function mergePayload(
  local: SyncPayload,
  remote: SyncPayload
): SyncPayload {
  const remoteMemos = remote.memos ?? [];
  const localMemos = local.memos ?? [];
  if (remote.version > local.version) {
    return {
      projects: mergeProjects(local.projects, remote.projects),
      tasks: mergeTasks(local.tasks, remote.tasks),
      tags: remote.tags.length ? remote.tags : local.tags,
      memos: mergeMemos(localMemos, remoteMemos),
      version: remote.version,
    };
  }
  return {
    projects: mergeProjects(local.projects, remote.projects),
    tasks: mergeTasks(local.tasks, remote.tasks),
    tags: local.tags,
    memos: mergeMemos(localMemos, remoteMemos),
    version: Math.max(local.version, remote.version),
  };
}
