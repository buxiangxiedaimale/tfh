"use client";

import { Send } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTodoStore } from "@/store/todo-store";

export function MemoComposer() {
  const addMemo = useTodoStore((s) => s.addMemo);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMemo(trimmed);
    setText("");
    ref.current?.focus();
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4 py-3 md:bottom-0 md:left-[68px] md:pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-xl">
        <div className="elevated-md rounded-2xl border border-memo-card-border/80 bg-memo-card p-3 focus-within:ring-2 focus-within:ring-accent/25">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="记录想法… #标签 · Ctrl+Enter 发送"
            rows={2}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">底部输入，随时记录</span>
            <Button
              size="sm"
              onClick={submit}
              disabled={!text.trim()}
              className="gap-1 shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              记录
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
