"use client";

import { format, parseISO } from "date-fns";
import { MoreHorizontal, Pin, Trash2, X } from "lucide-react";
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
      textareaRef.current?.focus();
    }
  }, [editing]);

  const enterEdit = () => {
    setDraft(memo.content);
    setEditingMemoId(memo.id);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) updateMemo(memo.id, trimmed);
    else deleteMemo(memo.id);
    setEditingMemoId(null);
  };

  const closeMenu = () => setMenuOpen(false);

  const handlePin = () => {
    toggleMemoPin(memo.id);
    closeMenu();
  };

  const handleDelete = () => {
    deleteMemo(memo.id);
    closeMenu();
  };

  return (
    <>
      <article
        className={cn(
          "group relative rounded-2xl border bg-memo-card px-4 py-3.5 transition-all duration-200 elevated hover:shadow-md",
          memo.pinned
            ? "border-accent/30 ring-1 ring-accent/10"
            : "border-memo-card-border/80"
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <time className="text-xs text-muted-foreground">
            {format(parseISO(memo.createdAt), "HH:mm")}
            {memo.pinned && (
              <Pin className="ml-1.5 inline h-3 w-3 text-accent" />
            )}
          </time>
          <Button
            variant="secondary"
            size="icon"
            aria-label="更多操作"
            aria-expanded={menuOpen}
            className="h-8 w-8 shrink-0 md:hidden"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(true);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <div className="relative hidden md:block">
            <Button
              variant="ghost"
              size="icon"
              aria-label="更多操作"
              aria-expanded={menuOpen}
              className={cn(
                "h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                menuOpen && "opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={closeMenu} />
                <div className="absolute right-0 top-9 z-50 min-w-[132px] rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
                  <MenuItems
                    pinned={memo.pinned}
                    onPin={handlePin}
                    onDelete={handleDelete}
                  />
                </div>
              </>
            ) : null}
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
            onClick={enterEdit}
          >
            <MemoContent
              content={memo.content}
              onTagClick={(tag) => setMemoTagFilter(tag)}
            />
          </button>
        )}
      </article>

      {/* 移动端：底部操作面板，避免被输入框遮挡或被 overflow 裁剪 */}
      {menuOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="关闭菜单"
            onClick={closeMenu}
          />
          <div
            role="dialog"
            aria-label="小记操作"
            className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-t-2xl border-t border-border bg-surface-1 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">
                操作
              </span>
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              <MenuItems
                pinned={memo.pinned}
                onPin={handlePin}
                onDelete={handleDelete}
                variant="sheet"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MenuItems({
  pinned,
  onPin,
  onDelete,
  variant = "dropdown",
}: {
  pinned: boolean;
  onPin: () => void;
  onDelete: () => void;
  variant?: "dropdown" | "sheet";
}) {
  const itemClass =
    variant === "sheet"
      ? "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-base active:bg-surface-2"
      : "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2";

  return (
    <>
      <button type="button" className={itemClass} onClick={onPin}>
        <Pin className="h-4 w-4 shrink-0" />
        {pinned ? "取消置顶" : "置顶"}
      </button>
      <button
        type="button"
        className={cn(itemClass, "text-destructive")}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        删除
      </button>
    </>
  );
}
