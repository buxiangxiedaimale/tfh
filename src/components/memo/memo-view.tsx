"use client";

import { X } from "lucide-react";
import { MemoCard } from "@/components/memo/memo-card";
import { MemoComposer } from "@/components/memo/memo-composer";
import { groupMemosByDate, getAllMemoTags } from "@/lib/memo/utils";
import { useTodoStore } from "@/store/todo-store";
import { cn } from "@/lib/utils";

export function MemoView() {
  const {
    getFilteredMemos,
    memos,
    memoTagFilter,
    setMemoTagFilter,
  } = useTodoStore();

  const filtered = getFilteredMemos();
  const groups = groupMemosByDate(filtered);
  const allTags = getAllMemoTags(memos);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-memo-bg">
      <header className="hidden shrink-0 border-b border-memo-card-border px-4 py-4 sm:px-8 md:block">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-memo-foreground">
              小记
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              像 flomo 一样捕捉灵感 · 已同步
            </p>
          </div>
          <span className="rounded-full bg-memo-card px-3 py-1 text-xs text-muted-foreground">
            {memos.length} 条
          </span>
        </div>
      </header>

      {allTags.length > 0 && (
        <div className="shrink-0 border-b border-memo-card-border px-4 py-2 sm:px-8">
          <div className="mx-auto flex max-w-xl flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setMemoTagFilter(null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                !memoTagFilter
                  ? "bg-memo-tag text-white"
                  : "bg-memo-card text-muted-foreground hover:bg-surface-2"
              )}
            >
              全部
            </button>
            {allTags.map(({ name, count }) => (
              <button
                key={name}
                type="button"
                onClick={() => setMemoTagFilter(name)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors",
                  memoTagFilter === name
                    ? "bg-memo-tag text-white"
                    : "bg-memo-card text-memo-tag hover:bg-memo-tag/10"
                )}
              >
                #{name}
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            ))}
            {memoTagFilter && (
              <button
                type="button"
                onClick={() => setMemoTagFilter(null)}
                className="flex items-center gap-0.5 rounded-full px-2 py-1 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3" />
                清除筛选
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-44 sm:px-8 md:pb-36">
        <div className="mx-auto max-w-xl space-y-8">
          {groups.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="text-lg">还没有小记</p>
              <p className="mt-2 text-sm">在底部输入框写下第一条想法吧</p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <h3 className="mb-3 text-sm font-semibold text-memo-tag">
                  {group.label}
                </h3>
                <ul className="space-y-3">
                  {group.items.map((memo) => (
                    <li key={memo.id}>
                      <MemoCard memo={memo} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      <MemoComposer />
    </div>
  );
}
