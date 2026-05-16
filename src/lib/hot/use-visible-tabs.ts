"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "hot-visible-tabs-v1";

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(next: string[] | null) {
  if (typeof window === "undefined") return;
  try {
    if (next === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  // 同一页面其它订阅者手动触发
  window.dispatchEvent(new Event("hot-visible-tabs-change"));
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("hot-visible-tabs-change", callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("hot-visible-tabs-change", callback);
  };
}

function parseRaw(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * 用户自定义热榜 tab 显示集合。
 * - null：未自定义，显示全部
 * - string[]：用户选择的 key 列表
 */
export function useHotVisibleTabs() {
  const raw = useSyncExternalStore(
    subscribe,
    readStorage,
    () => null
  );
  const visible = parseRaw(raw);

  const isVisible = useCallback(
    (key: string) => {
      if (visible === null) return true;
      return visible.includes(key);
    },
    [visible]
  );

  const toggle = useCallback(
    (key: string, allKeys: string[]) => {
      const base = visible ?? allKeys;
      const next = base.includes(key)
        ? base.filter((k) => k !== key)
        : [...base, key];
      if (next.length === 0) return;
      writeStorage(next);
    },
    [visible]
  );

  const reset = useCallback(() => writeStorage(null), []);

  const selectAll = useCallback(
    (allKeys: string[]) => writeStorage(allKeys),
    []
  );

  return {
    isVisible,
    toggle,
    reset,
    selectAll,
    isCustomized: visible !== null,
  };
}
