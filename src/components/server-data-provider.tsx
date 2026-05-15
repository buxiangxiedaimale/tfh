"use client";

import { useEffect, useRef } from "react";
import { useTodoStore } from "@/store/todo-store";
import type { SyncPayload } from "@/types";

const SAVE_DELAY_MS = 800;

async function fetchServerPayload(): Promise<SyncPayload | null> {
  const res = await fetch("/api/data", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "读取服务器数据失败");
  return json.payload as SyncPayload | null;
}

async function saveServerPayload(payload: SyncPayload) {
  const res = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "保存服务器数据失败");
  }
}

export function ServerDataProvider() {
  const syncVersion = useTodoStore((s) => s.syncVersion);
  const paused = useTodoStore((s) => s._syncPaused);
  const initialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedVersion = useRef(0);

  useEffect(() => {
    let disposed = false;

    async function init() {
      try {
        useTodoStore.getState().setSyncStatus("connecting");
        const payload = await fetchServerPayload();
        if (disposed) return;

        if (payload) {
          useTodoStore.getState().hydrateFromRemote(payload);
          lastSavedVersion.current = payload.version;
        } else {
          const localPayload = useTodoStore.getState().getSyncPayload();
          await saveServerPayload(localPayload);
          lastSavedVersion.current = localPayload.version;
          useTodoStore.setState({
            lastSyncedAt: new Date().toISOString(),
            syncStatus: "synced",
          });
        }

        initialized.current = true;
      } catch (error) {
        console.error("Server data initialization failed", error);
        useTodoStore.getState().setSyncStatus("error");
      }
    }

    init();
    return () => {
      disposed = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!initialized.current || paused) return;
    if (syncVersion <= lastSavedVersion.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        useTodoStore.getState().setSyncStatus("syncing");
        const payload = useTodoStore.getState().getSyncPayload();
        await saveServerPayload(payload);
        lastSavedVersion.current = payload.version;
        useTodoStore.setState({
          lastSyncedAt: new Date().toISOString(),
          syncStatus: "synced",
        });
      } catch (error) {
        console.error("Server data save failed", error);
        useTodoStore.getState().setSyncStatus("error");
      }
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [syncVersion, paused]);

  return null;
}
