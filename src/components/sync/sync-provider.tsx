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

const PUSH_DELAY_MS = 1200;

export function SyncProvider() {
  const workspaceId = useTodoStore((s) => s.syncWorkspaceId);
  const syncVersion = useTodoStore((s) => s.syncVersion);
  const paused = useTodoStore((s) => s._syncPaused);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedVersion = useRef(0);
  const applyingRemote = useRef(false);

  useEffect(() => {
    if (!canSync() || !workspaceId) {
      useTodoStore.getState().setSyncStatus("offline");
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      useTodoStore.getState().setSyncStatus("connecting");
      const remote = await pullSnapshot(workspaceId);
      if (remote) {
        applyingRemote.current = true;
        const local = useTodoStore.getState().getSyncPayload();
        const merged = mergeRemote(local, remote);
        useTodoStore.getState().hydrateFromRemote(merged);
        lastPushedVersion.current = merged.version;
        applyingRemote.current = false;
      }
      useTodoStore.getState().setSyncStatus("synced");

      unsubscribe = subscribeSnapshot(workspaceId, (payload) => {
        if (applyingRemote.current) return;
        const current = useTodoStore.getState().getSyncPayload();
        if (payload.version <= current.version) return;
        applyingRemote.current = true;
        const merged = mergeRemote(current, payload);
        useTodoStore.getState().hydrateFromRemote(merged);
        lastPushedVersion.current = merged.version;
        applyingRemote.current = false;
      });
    };

    init();
    return () => unsubscribe?.();
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
