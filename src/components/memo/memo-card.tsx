"use client";

import { format, parseISO } from "date-fns";
import { MoreHorizontal, Pin, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MemoContent } from "@/components/memo/memo-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types";
import { useTodoStore } from "@/store/todo-store";

interface MemoCardProps {
  memo: Memo;
}

export function MemoCard({ memo }: MemoCardProps) {
  const {
    deleteMemo,
    toggleMemoPin,
    updateMemo,
    setMemoTagFilter,
    editingMemoId,
    setEditingMemoId,
  } = useTodoStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(memo.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editing = editingMemoId === memo.id;

  useEffect(() => {
    if (editing) {
      setDraft(memo.content);
      textareaRef.current?.focus();
    }
  }, [editing, memo.content]);

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) updateMemo(memo.id, trimmed);
    else deleteMemo(memo.id);
    setEditingMemoId(null);
  };

  return (
    <article
      className={cn(
        "group relative rounded-2xl border bg-memo-card px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md",
        memo.pinned ? "border-memo-tag/30" : "border-memo-card-border"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <time className="text-xs text-muted-foreground">
          {format(parseISO(memo.createdAt), "HH:mm")}
          {memo.pinned && (
            <Pin className="ml-1.5 inline h-3 w-3 text-memo-tag" />
          )}
        </time>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-8 z-20 min-w-[120px] rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2"
                  onClick={() => {
                    toggleMemoPin(memo.id);
                    setMenuOpen(false);
                  }}
                >
                  <Pin className="h-3.5 w-3.5" />
                  {memo.pinned ? "取消置顶" : "置顶"}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-surface-2"
                  onClick={() => {
                    deleteMemo(memo.id);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditingMemoId(null);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              saveEdit();
            }
          }}
          rows={4}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
        />
      ) : (
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setEditingMemoId(memo.id)}
        >
          <MemoContent
            content={memo.content}
            onTagClick={(tag) => setMemoTagFilter(tag)}
          />
        </button>
      )}
    </article>
  );
}
