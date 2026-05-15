import type { ParsedTaskIntent } from "@/lib/ai/types";
import { toDateInputValue } from "@/lib/dates";
import type { Priority, Project, Task } from "@/types";

export function getViewTaskDefaults(activeView: string) {
  const projectId = activeView.startsWith("project:")
    ? activeView.slice(8)
    : undefined;
  const dueDate =
    activeView === "today"
      ? toDateInputValue()
      : undefined;
  return { projectId, dueDate };
}

export function resolveProjectId(
  projects: Project[],
  projectName: string | undefined,
  fallback?: string
): string | undefined {
  if (!projectName) return fallback;
  const found = projects.find(
    (p) => p.name.toLowerCase() === projectName.toLowerCase()
  );
  return found?.id ?? fallback;
}

export function taskFromPlainText(
  text: string,
  activeView: string
): Partial<Task> & { title: string } {
  const { projectId, dueDate } = getViewTaskDefaults(activeView);
  return {
    title: text.trim(),
    projectId,
    dueDate,
    priority: "none",
  };
}

export function taskFromParsedIntent(
  parsed: ParsedTaskIntent,
  activeView: string,
  projects: Project[]
): Partial<Task> & { title: string } {
  const { projectId, dueDate } = getViewTaskDefaults(activeView);
  return {
    title: parsed.title.trim(),
    description: parsed.description,
    dueDate: parsed.dueDate ?? dueDate,
    dueTime: parsed.dueTime,
    priority: (parsed.priority ?? "none") as Priority,
    projectId: resolveProjectId(projects, parsed.projectName, projectId),
    tags: parsed.tags,
    recurrence: parsed.recurrence,
  };
}
