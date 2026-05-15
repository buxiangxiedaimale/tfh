import type { Priority, Recurrence } from "@/types";

export interface ParsedTaskIntent {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: Priority;
  projectName?: string;
  tags?: string[];
  recurrence?: Recurrence;
}
