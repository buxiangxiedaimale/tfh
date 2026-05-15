"use client";

import { splitContentParts } from "@/lib/memo/utils";
import { cn } from "@/lib/utils";

interface MemoContentProps {
  content: string;
  onTagClick?: (tag: string) => void;
  className?: string;
}

export function MemoContent({ content, onTagClick, className }: MemoContentProps) {
  const parts = splitContentParts(content);

  return (
    <p className={cn("whitespace-pre-wrap text-[15px] leading-relaxed", className)}>
      {parts.map((part, i) =>
        part.type === "tag" ? (
          <button
            key={`${i}-${part.value}`}
            type="button"
            onClick={() => onTagClick?.(part.value)}
            className="mx-0.5 inline text-memo-tag hover:underline"
          >
            #{part.value}
          </button>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </p>
  );
}
