"use client";

import { Cloud, CloudOff, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canSync } from "@/lib/sync/engine";
import { useTodoStore } from "@/store/todo-store";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  offline: "未连接",
  connecting: "连接中…",
  synced: "已同步",
  syncing: "同步中…",
  error: "同步失败",
};

export function SyncPanel() {
  const {
    syncWorkspaceId,
    setSyncWorkspaceId,
    syncStatus,
    lastSyncedAt,
  } = useTodoStore();
  const [input, setInput] = useState(syncWorkspaceId ?? "");
  const configured = canSync();

  const generateId = () => {
    const id = crypto.randomUUID();
    setInput(id);
    setSyncWorkspaceId(id);
  };

  const connect = () => {
    const id = input.trim();
    if (!id) return;
    setSyncWorkspaceId(id);
  };

  const disconnect = () => {
    setSyncWorkspaceId(null);
    setInput("");
  };

  const copyId = () => {
    if (syncWorkspaceId) navigator.clipboard.writeText(syncWorkspaceId);
  };

  if (!configured) {
    return (
      <div className="mx-2 mb-2 rounded-xl border border-dashed border-border bg-surface-2/50 p-3 text-xs text-muted-foreground">
        配置 <code className="text-foreground">.env.local</code> 中的 Supabase
        变量以启用多设备同步。参见 <code>.env.example</code>。
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {syncStatus === "synced" || syncStatus === "syncing" ? (
          <Cloud className="h-4 w-4 text-accent" />
        ) : (
          <CloudOff className="h-4 w-4 text-muted-foreground" />
        )}
        多设备同步
        <span
          className={cn(
            "ml-auto text-xs",
            syncStatus === "error" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {statusLabel[syncStatus]}
        </span>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        在各设备输入相同同步 ID，数据将实时同步。
      </p>
      <div className="flex gap-1">
        <Input
          placeholder="同步 ID"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-8 text-xs"
        />
        {syncWorkspaceId ? (
          <Button size="sm" variant="secondary" onClick={copyId} title="复制 ID">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {!syncWorkspaceId ? (
          <>
            <Button size="sm" className="flex-1" onClick={connect}>
              连接
            </Button>
            <Button size="sm" variant="secondary" onClick={generateId}>
              生成 ID
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" className="w-full" onClick={disconnect}>
            断开同步
          </Button>
        )}
      </div>
      {lastSyncedAt && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          上次同步：{new Date(lastSyncedAt).toLocaleString("zh-CN")}
        </p>
      )}
    </div>
  );
}
