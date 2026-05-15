"use client";

import { useEffect, useRef } from "react";
import {
  canSync,
  pullSnapshot,
  pushSnapshot,
  subscribeSnapshot,
  mergeRemote,
} from "@/lib/sync/engine";
import { useTodoStore } from "@/store/todo-store";
import type { SyncPayload } from "@/types";

const PUSH_DELAY_MS = 1200;
const PULL_INTERVAL_MS = 10000;

export function SyncProvider() {
  const workspaceId = useTodoStore((s) => s.syncWorkspaceId);
  const syncVersion = useTodoStore((s) => s.syncVersion);
  const paused = useTodoStore((s) => s._syncPaused);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPushedVersion = useRef(0);
  const applyingRemote = useRef(false);

  useEffect(() => {
    if (!canSync() || !workspaceId) {
      useTodoStore.getState().setSyncStatus("offline");
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    const applyRemote = (payload: SyncPayload) => {
      if (applyingRemote.current) return;
      const current = useTodoStore.getState().getSyncPayload();
      if (payload.version <= current.version) return;
      applyingRemote.current = true;
      const merged = mergeRemote(current, payload);
      useTodoStore.getState().hydrateFromRemote(merged);
      lastPushedVersion.current = merged.version;
      applyingRemote.current = false;
    };

    const init = async () => {
      try {
        useTodoStore.getState().setSyncStatus("connecting");
        const remote = await pullSnapshot(workspaceId);
        if (disposed) return;
        if (remote) {
          applyingRemote.current = true;
          const local = useTodoStore.getState().getSyncPayload();
          const merged = mergeRemote(local, remote);
          useTodoStore.getState().hydrateFromRemote(merged);
          lastPushedVersion.current = merged.version;
          applyingRemote.current = false;
        }
        useTodoStore.getState().setSyncStatus("synced");

        unsubscribe = subscribeSnapshot(workspaceId, applyRemote);
        pullTimer.current = setInterval(async () => {
          const payload = await pullSnapshot(workspaceId);
          if (payload) applyRemote(payload);
        }, PULL_INTERVAL_MS);
      } catch (error) {
        console.error("Sync init failed", error);
        useTodoStore.getState().setSyncStatus("error");
        applyingRemote.current = false;
      }
    };

    init();
    return () => {
      disposed = true;
      unsubscribe?.();
      if (pullTimer.current) clearInterval(pullTimer.current);
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!canSync() || !workspaceId || paused || applyingRemote.current) return;
    if (syncVersion <= lastPushedVersion.current) return;

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      useTodoStore.getState().setSyncStatus("syncing");
      const payload = useTodoStore.getState().getSyncPayload();
      const ok = await pushSnapshot(workspaceId, payload);
      if (ok) {
        lastPushedVersion.current = payload.version;
        useTodoStore.setState({
          lastSyncedAt: new Date().toISOString(),
          syncStatus: "synced",
        });
      } else {
        useTodoStore.getState().setSyncStatus("error");
      }
    }, PUSH_DELAY_MS);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [syncVersion, workspaceId, paused]);

  return null;
}
