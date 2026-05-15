"use client";

import {
  ExternalLink,
  Flame,
  Heart,
  ListPlus,
  RefreshCw,
  Sparkles,
  ThumbsDown,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RebangHotItem, RebangTab } from "@/lib/rebang/types";
import {
  itemImageUrl,
  LEAF_TAB_DEFAULT_SUB,
  tabIconUrl,
} from "@/lib/rebang/api";
import { useTodoStore } from "@/store/todo-store";
import type { HotRecommendation, InterestKind } from "@/types";

function TabIcon({ tab }: { tab: RebangTab }) {
  const [failed, setFailed] = useState(false);
  const src = tabIconUrl(tab);

  if (!src || failed) {
    return (
      <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm bg-accent/80 text-[8px] font-bold text-white">
        {tab.name.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-3 w-3 shrink-0 rounded-sm object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

const TOP_SUB_TABS = [
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
  const [recommendations, setRecommendations] = useState<HotRecommendation[]>([]);
  const [recommendationMode, setRecommendationMode] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [feedbackKeys, setFeedbackKeys] = useState<Record<string, InterestKind>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const params = new URLSearchParams({ tab: activeTab, page: "1" });
        if (activeTab === "top") {
          params.set("sub_tab", subTab || "today");
        } else if (subTabs.length > 0 && subTab) {
          params.set("sub_tab", subTab);
        }
        const res = await fetch(`/api/rebang/items?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "加载失败");
        setItems(json.data.list ?? []);
        setRecommendations([]);
        setRecommendationMode(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, subTab, subTabs.length]
  );

  useEffect(() => {
    fetch("/api/rebang/tabs")
      .then((r) => r.json())
      .then((json) => {
        const homeTabs = json.data?.homeTabs as RebangTab[] | undefined;
        if (homeTabs?.length) {
          setTabs(homeTabs);
          const current = homeTabs.find((t) => t.current_show) ?? homeTabs[0];
          setActiveTab(current.key);
          if (current.key === "top") setSubTab("today");
          else if (current.child?.[0]) setSubTab(current.child[0].key);
          else if (LEAF_TAB_DEFAULT_SUB[current.key])
            setSubTab(LEAF_TAB_DEFAULT_SUB[current.key]);
        }
      })
      .catch(() => setError("无法加载热榜分类"));
  }, []);

  useEffect(() => {
    if (tabs.length) loadItems();
  }, [tabs.length, loadItems]);

  const switchTab = (tab: RebangTab) => {
    setActiveTab(tab.key);
    if (tab.key === "top") {
      setSubTab("today");
    } else if (tab.child?.length) {
      const defaultChild =
        tab.child.find((c) => c.current_show) ?? tab.child[0];
      setSubTab(defaultChild.key);
    } else if (LEAF_TAB_DEFAULT_SUB[tab.key]) {
      setSubTab(LEAF_TAB_DEFAULT_SUB[tab.key]);
    } else {
      setSubTab("");
    }
  };

  const saveAsTask = (item: RebangHotItem) => {
    addTask({
      title: item.title.slice(0, 200),
      description: item.www_url,
      priority: "none",
    });
  };

  const sourceName = currentTab?.name ?? activeTab;

  const itemsWithSource = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        source: sourceName,
      })),
    [items, sourceName]
  );

  const recommendationMap = useMemo(
    () => new Map(recommendations.map((item) => [item.itemKey, item])),
    [recommendations]
  );

  const visibleItems = useMemo(() => {
    if (!recommendationMode) return items;
    const itemMap = new Map(items.map((item) => [item.item_key, item]));
    return recommendations
      .map((rec) => itemMap.get(rec.itemKey))
      .filter(Boolean) as RebangHotItem[];
  }, [items, recommendationMode, recommendations]);

  const generateRecommendations = async () => {
    if (!items.length || recommending) return;
    setRecommending(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations/hot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsWithSource }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "推荐失败");
      setRecommendations(json.recommendations ?? []);
      setRecommendationMode(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "推荐失败");
    } finally {
      setRecommending(false);
    }
  };

  const sendFeedback = async (item: RebangHotItem, kind: InterestKind) => {
    setFeedbackKeys((prev) => ({ ...prev, [item.item_key]: kind }));
    try {
      const res = await fetch("/api/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          item: {
            ...item,
            source: sourceName,
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "保存兴趣失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存兴趣失败");
      setFeedbackKeys((prev) => {
        const next = { ...prev };
        delete next[item.item_key];
        return next;
      });
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <header className="hidden shrink-0 border-b border-border px-4 py-4 sm:px-8 md:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 text-orange-500">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">今日热榜</h2>
              <p className="text-xs text-muted-foreground">
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
            onClick={() => loadItems(true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={generateRecommendations}
            disabled={recommending || items.length === 0}
            className="gap-1.5"
          >
            <Sparkles className={cn("h-4 w-4", recommending && "animate-pulse")} />
            推荐
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-6">
          <button
            type="button"
            onClick={generateRecommendations}
            disabled={recommending || items.length === 0}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors",
              recommendationMode
                ? "bg-accent text-accent-foreground"
                : "bg-surface-2 text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className={cn("h-3.5 w-3.5", recommending && "animate-pulse")} />
            推荐
          </button>
          <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto scrollbar-thin">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchTab(tab)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors",
                  activeTab === tab.key
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-2 text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.avatar ? <TabIcon tab={tab} /> : null}
                {tab.name}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => loadItems(true)}
            disabled={refreshing}
            className="h-7 w-7 shrink-0 md:hidden"
            title="刷新"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
          </Button>
        </div>
        {subTabs.length > 0 ? (
          <div className="flex gap-0.5 overflow-x-auto border-t border-border px-3 py-1.5 sm:px-6 scrollbar-thin">
            {subTabs.map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setSubTab(st.key)}
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
                  subTab === st.key
                    ? "bg-surface-3 text-foreground"
                    : "text-muted-foreground hover:bg-surface-2"
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <p className="py-20 text-center text-muted-foreground">加载中…</p>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-destructive">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={() => loadItems()}>
              重试
            </Button>
          </div>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2">
            {recommendationMode && recommendations.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-border bg-surface-1 p-6 text-center text-sm text-muted-foreground">
                还没有足够的兴趣样本。先在热榜里点几条「感兴趣」，我就能开始学习。
              </li>
            ) : null}
            {visibleItems.map((item, index) => {
              const rec = recommendationMap.get(item.item_key);
              const feedback = feedbackKeys[item.item_key];
              return (
                <li
                  key={item.item_key}
                  className="group elevated flex gap-3 rounded-2xl border border-border/60 bg-surface-1 p-3.5 transition-shadow hover:shadow-md"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-sm font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <a
                          href={item.www_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium leading-snug hover:text-accent"
                        >
                          {item.title}
                        </a>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {item.heat_str ? (
                            <span className="text-orange-500/90">{item.heat_str}</span>
                          ) : null}
                          {rec ? (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                              推荐 {Math.round(rec.score * 100)}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            feedback === "positive" && "bg-accent/10 text-accent"
                          )}
                          title="感兴趣"
                          onClick={() => sendFeedback(item, "positive")}
                        >
                          <Heart className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            feedback === "negative" && "bg-destructive/10 text-destructive"
                          )}
                          title="不感兴趣"
                          onClick={() => sendFeedback(item, "negative")}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="转为待办"
                          onClick={() => saveAsTask(item)}
                        >
                          <ListPlus className="h-3.5 w-3.5" />
                        </Button>
                        <a
                          href={item.www_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="打开原文"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                    {rec ? (
                      <div className="mt-2 rounded-xl bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
                        <p className="text-foreground/80">{rec.reason}</p>
                        {rec.matchedInterests.length ? (
                          <p className="mt-1">
                            匹配兴趣：{rec.matchedInterests.slice(0, 2).join("、")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
