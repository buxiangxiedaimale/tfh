"use client";

import {
  Check,
  ExternalLink,
  Flame,
  ListPlus,
  RefreshCw,
  RotateCcw,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RebangHotItem, RebangTab } from "@/lib/rebang/types";
import {
  LEAF_TAB_DEFAULT_SUB,
  tabIconUrl,
} from "@/lib/rebang/api";
import {
  isMobileEnv,
  isStandalonePWA,
  toMobileUrl,
} from "@/lib/rebang/mobile-url";
import { useHotVisibleTabs } from "@/lib/hot/use-visible-tabs";
import { useTodoStore } from "@/store/todo-store";

function TabIcon({ tab }: { tab: RebangTab }) {
  const [failed, setFailed] = useState(false);
  const src = tabIconUrl(tab);

  if (!src || failed) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-accent/80 text-[9px] font-bold text-white">
        {tab.name.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-4 w-4 shrink-0 rounded-md object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function rankClasses(rank: number) {
  if (rank === 1)
    return "bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-sm";
  if (rank === 2)
    return "bg-gradient-to-br from-orange-400 to-amber-400 text-white shadow-sm";
  if (rank === 3)
    return "bg-gradient-to-br from-amber-400 to-yellow-400 text-white shadow-sm";
  return "bg-surface-2 text-muted-foreground";
}

type HotSubTab = { key: string; label: string };

const TOP_SUB_TABS: HotSubTab[] = [
  { key: "today", label: "今日" },
  { key: "weekly", label: "本周" },
  { key: "monthly", label: "本月" },
];

export function HotView() {
  const addTask = useTodoStore((s) => s.addTask);
  const [tabs, setTabs] = useState<RebangTab[]>([]);
  const [activeTab, setActiveTab] = useState("top");
  const [subTab, setSubTab] = useState("today");
  const [items, setItems] = useState<RebangHotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const { isVisible, toggle, reset, selectAll, isCustomized } =
    useHotVisibleTabs();

  const allTabKeys = useMemo(() => tabs.map((t) => t.key), [tabs]);
  const visibleTabs = useMemo(
    () => tabs.filter((t) => isVisible(t.key)),
    [tabs, isVisible]
  );

  const currentTab = useMemo(
    () => tabs.find((t) => t.key === activeTab),
    [tabs, activeTab]
  );

  const subTabs = useMemo(() => {
    if (activeTab === "top") return TOP_SUB_TABS;
    return (
      currentTab?.child?.map((c) => ({ key: c.key, label: c.name })) ?? []
    );
  }, [activeTab, currentTab]);

  const loadItems = useCallback(
    async (
      tabKey: string,
      subKey: string,
      tabSubTabs: HotSubTab[],
      silent = false
    ) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const params = new URLSearchParams({ tab: tabKey, page: "1" });
        if (tabKey === "top") {
          params.set("sub_tab", subKey || "today");
        } else if (tabSubTabs.length > 0 && subKey) {
          params.set("sub_tab", subKey);
        }
        const res = await fetch(`/api/rebang/items?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "加载失败");
        setItems(json.data.list ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetch("/api/rebang/tabs")
      .then((r) => r.json())
      .then((json) => {
        const homeTabs = json.data?.homeTabs as RebangTab[] | undefined;
        if (homeTabs?.length) {
          setTabs(homeTabs);
          const current = homeTabs.find((t) => t.current_show) ?? homeTabs[0];
          const currentSubTabs =
            current.key === "top"
              ? TOP_SUB_TABS
              : current.child?.map((c) => ({ key: c.key, label: c.name })) ?? [];
          const initialSubTab =
            current.key === "top"
              ? "today"
              : current.child?.[0]?.key ??
                LEAF_TAB_DEFAULT_SUB[current.key] ??
                "";
          setActiveTab(current.key);
          setSubTab(initialSubTab);
          loadItems(current.key, initialSubTab, currentSubTabs);
        }
      })
      .catch(() => setError("无法加载热榜分类"));
  }, [loadItems]);

  const switchTab = (tab: RebangTab) => {
    const nextSubTabs =
      tab.key === "top"
        ? TOP_SUB_TABS
        : tab.child?.map((c) => ({ key: c.key, label: c.name })) ?? [];
    const nextSubTab =
      tab.key === "top"
        ? "today"
        : tab.child?.find((c) => c.current_show)?.key ??
          tab.child?.[0]?.key ??
          LEAF_TAB_DEFAULT_SUB[tab.key] ??
          "";
    setActiveTab(tab.key);
    setSubTab(nextSubTab);
    loadItems(tab.key, nextSubTab, nextSubTabs);
  };

  const switchSubTab = (key: string) => {
    setSubTab(key);
    loadItems(activeTab, key, subTabs);
  };

  const saveAsTask = (item: RebangHotItem) => {
    addTask({
      title: item.title.slice(0, 200),
      description: item.www_url,
      priority: "none",
    });
  };

  // 客户端检测环境。在移动端对 URL 做转换；在 iOS PWA standalone 下
  // <a target="_blank"> 是 WebKit 已知 bug 的空操作（点了没反应，见
  // https://bugs.webkit.org/show_bug.cgi?id=146224），必须拦截点击并手工
  // 跳转；iOS 会把跨域 location.href 赋值自动交给 Safari 打开新页面，
  // 且 Universal Link 的 App 唤起仍然生效。
  const [isMobile, setIsMobile] = useState(false);
  const [isIOSStandalone, setIsIOSStandalone] = useState(false);
  useEffect(() => {
    setIsMobile(isMobileEnv());
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    setIsIOSStandalone(isIOS && isStandalonePWA());
  }, []);

  const linkHref = useCallback(
    (url: string) => (isMobile ? toMobileUrl(url) : url),
    [isMobile]
  );

  const handleHotLinkClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      // 修饰键 / 中键 交给浏览器原生行为
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }
      if (!isIOSStandalone) return; // 其它环境依赖原生 target="_blank"
      e.preventDefault();
      const href = e.currentTarget.href;
      window.location.href = href;
    },
    [isIOSStandalone]
  );

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <header className="glass-panel shrink-0 border-b border-border/60 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-8 md:pt-4 md:pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
              <Flame className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight md:text-2xl">
                今日热榜
              </h2>
              <p className="hidden text-xs text-muted-foreground md:block">
                数据来自{" "}
                <a
                  href="https://rebang.today/home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  rebang.today
                </a>
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadItems(activeTab, subTab, subTabs, true)}
            disabled={refreshing}
            className="h-9 gap-1.5 rounded-full"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">刷新</span>
          </Button>
        </div>
      </header>

      {manageOpen ? (
        <ManageTabsSheet
          tabs={tabs}
          isVisible={isVisible}
          isCustomized={isCustomized}
          onToggle={(key) => {
            toggle(key, allTabKeys);
            if (key === activeTab && isVisible(activeTab)) {
              const next = visibleTabs.find((t) => t.key !== key);
              if (next) switchTab(next);
            }
          }}
          onSelectAll={() => selectAll(allTabKeys)}
          onReset={reset}
          onClose={() => setManageOpen(false)}
        />
      ) : null}

      <div className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
        <div className="border-b border-border/60 bg-background/80 px-3 py-2.5 sm:px-6 sm:py-3">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchTab(tab)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95",
                    activeTab === tab.key
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                  )}
                >
                  {tab.avatar ? <TabIcon tab={tab} /> : null}
                  {tab.name}
                </button>
              ))}
              {visibleTabs.length === 0 ? (
                <span className="text-xs text-muted-foreground py-1.5">
                  未选择任何来源，点击右侧管理添加
                </span>
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setManageOpen(true)}
              className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs"
              aria-label="管理来源"
              title="管理来源"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">管理</span>
            </Button>
          </div>
        </div>
        {subTabs.length > 0 ? (
          <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur sm:px-6 scrollbar-thin">
            {subTabs.map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => switchSubTab(st.key)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 active:scale-95",
                  subTab === st.key
                    ? "bg-foreground/90 text-background"
                    : "text-muted-foreground hover:bg-surface-2"
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="px-3 pt-3 sm:px-6 sm:pt-4">
        {loading ? (
          <ul className="mx-auto max-w-3xl space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="elevated flex gap-3 rounded-2xl border border-border/60 bg-surface-1 p-3.5"
              >
                <span className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <span className="block h-3.5 w-4/5 animate-pulse rounded bg-surface-2" />
                  <span className="block h-3 w-1/3 animate-pulse rounded bg-surface-2" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-destructive">{error}</p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => loadItems(activeTab, subTab, subTabs)}
            >
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            暂无数据
          </p>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2">
            {items.map((item, index) => {
              const rank = index + 1;
              return (
                <li
                  key={item.item_key}
                  className="group elevated flex gap-3 rounded-2xl border border-border/60 bg-surface-1 p-3 transition-all duration-150 hover:shadow-md active:scale-[0.99] sm:p-3.5"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                      rankClasses(rank)
                    )}
                  >
                    {rank}
                  </span>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <a
                      href={linkHref(item.www_url)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={handleHotLinkClick}
                      className="block min-w-0 flex-1"
                    >
                      <p className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground group-hover:text-accent sm:text-sm">
                        {item.title}
                      </p>
                      {item.heat_str ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-orange-500/90">
                          <TrendingUp className="h-3 w-3" />
                          {item.heat_str}
                        </p>
                      ) : null}
                    </a>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl active:scale-90 md:h-8 md:w-8"
                        title="转为待办"
                        onClick={() => saveAsTask(item)}
                      >
                        <ListPlus className="h-4 w-4 md:h-3.5 md:w-3.5" />
                      </Button>
                      <a
                        href={linkHref(item.www_url)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={handleHotLinkClick}
                        title="打开原文"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground active:scale-90 md:h-8 md:w-8"
                      >
                        <ExternalLink className="h-4 w-4 md:h-3.5 md:w-3.5" />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}

interface ManageTabsSheetProps {
  tabs: RebangTab[];
  isVisible: (key: string) => boolean;
  isCustomized: boolean;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onReset: () => void;
  onClose: () => void;
}

function ManageTabsSheet({
  tabs,
  isVisible,
  isCustomized,
  onToggle,
  onSelectAll,
  onReset,
  onClose,
}: ManageTabsSheetProps) {
  const visibleCount = useMemo(
    () => tabs.filter((t) => isVisible(t.key)).length,
    [tabs, isVisible]
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed z-[70] flex flex-col overflow-hidden bg-surface-1 shadow-2xl",
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl border-t border-border/60 pb-[env(safe-area-inset-bottom)]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8%] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-3xl sm:border sm:pb-0"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold sm:text-lg">管理来源</h3>
            <p className="text-xs text-muted-foreground">
              已显示 {visibleCount} / {tabs.length} 个
              {isCustomized ? "（已自定义）" : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-5 py-2.5 sm:px-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSelectAll}
            className="h-8 gap-1 rounded-full px-3 text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            全选
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReset}
            disabled={!isCustomized}
            className="h-8 gap-1 rounded-full px-3 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {tabs.map((tab) => {
              const checked = isVisible(tab.key);
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onToggle(tab.key)}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 active:scale-95",
                    checked
                      ? "border-accent/40 bg-accent-muted text-accent shadow-sm"
                      : "border-border bg-surface-1 text-foreground hover:border-border hover:bg-surface-2"
                  )}
                >
                  {tab.avatar ? <TabIcon tab={tab} /> : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">
                      {tab.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{tab.name}</span>
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border"
                    )}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-border/60 px-5 py-3 sm:px-6">
          <Button onClick={onClose} className="w-full" size="lg">
            完成
          </Button>
        </div>
      </div>
    </>
  );
}
