"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
  priority?: "none" | "low" | "medium" | "high";
}

const priorityRing: Record<string, string> = {
  none: "border-border hover:border-muted-foreground",
  low: "border-priority-low hover:border-priority-low",
  medium: "border-priority-medium hover:border-priority-medium",
  high: "border-priority-high hover:border-priority-high",
};

export function Checkbox({
  checked,
  onChange,
  className,
  priority = "none",
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all",
        checked
          ? "border-accent bg-accent text-accent-foreground"
          : priorityRing[priority],
        className
      )}
    >
      {checked && <Check className="h-3 w-3 stroke-[3]" />}
    </button>
  );
}
