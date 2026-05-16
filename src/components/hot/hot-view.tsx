"use client";

import {
  ExternalLink,
  Flame,
  Heart,
  ListPlus,
  Bookmark,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RebangHotItem, RebangTab } from "@/lib/rebang/types";
import {
  LEAF_TAB_DEFAULT_SUB,
  tabIconUrl,
} from "@/lib/rebang/api";
import { useTodoStore } from "@/store/todo-store";
import type {
  FeatureScores,
  HotRecommendation,
  InterestKind,
  ProfileOverride,
  ProfileTagType,
  RecallChannel,
  UserProfile,
} from "@/types";

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

type HotRecommendationRecord = HotRecommendation & {
  url?: string;
  baseScore?: number;
  llmScore?: number;
  featureScores?: FeatureScores;
  recallChannels?: RecallChannel[];
  exploration?: boolean;
  firstRecommendedAt?: string;
  lastRecommendedAt?: string;
  item: RebangHotItem & { source?: string };
};

type HotRunInfo = {
  generatedAt: string;
  durationMs: number | null;
  candidateCount: number;
  resultCount: number;
  trigger: string;
  configured: boolean;
  profile: UserProfile | null;
};

const RECALL_CHANNEL_LABEL: Record<RecallChannel, string> = {
  domain: "领域",
  identity: "身份",
  style: "风格",
  freshness: "新鲜",
  exploration: "探索",
  negative_filter: "已过滤",
};

const TAG_SECTIONS: Array<{
  type: ProfileTagType;
  title: string;
  empty: string;
  badgeClass: string;
}> = [
  {
    type: "identity",
    title: "身份",
    empty: "尚未推断身份。",
    badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  },
  {
    type: "domain",
    title: "兴趣领域",
    empty: "尚未识别兴趣领域。",
    badgeClass: "bg-accent/10 text-accent",
  },
  {
    type: "style",
    title: "偏好风格",
    empty: "尚未识别风格。",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  {
    type: "avoid",
    title: "避免内容",
    empty: "未设置避免标签。",
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
];

const RECOMMEND_STEPS = [
  { key: "fetch", label: "抓取候选" },
  { key: "embed", label: "向量化" },
  { key: "rank", label: "语义匹配" },
  { key: "llm", label: "AI 精排" },
  { key: "save", label: "整理结果" },
];

function formatRelative(iso?: string | null) {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function HotView() {
  const addTask = useTodoStore((s) => s.addTask);
  const [tabs, setTabs] = useState<RebangTab[]>([]);
  const [activeTab, setActiveTab] = useState("top");
  const [subTab, setSubTab] = useState("today");
  const [items, setItems] = useState<RebangHotItem[]>([]);
  const [recommendations, setRecommendations] = useState<HotRecommendationRecord[]>([]);
  const [runInfo, setRunInfo] = useState<HotRunInfo | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileOverrides, setProfileOverrides] = useState<ProfileOverride[]>(
    []
  );
  const [profileBusy, setProfileBusy] = useState(false);
  const [recommendationMode, setRecommendationMode] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [feedbackKeys, setFeedbackKeys] = useState<Record<string, InterestKind>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInputs, setTagInputs] = useState<Record<ProfileTagType, string>>({
    identity: "",
    domain: "",
    style: "",
    avoid: "",
  });

  const currentTab = useMemo(
    () => tabs.find((t) => t.key === activeTab),
    [tabs, activeTab]
  );

  const itemSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const rec of recommendations) {
      const source = rec.item?.source;
      if (source) map.set(rec.itemKey, source);
    }
    return map;
  }, [recommendations]);

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
    setRecommendationMode(false);
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

  const recommendationMap = useMemo(
    () => new Map(recommendations.map((rec) => [rec.itemKey, rec])),
    [recommendations]
  );

  const visibleItems = useMemo(() => {
    if (!recommendationMode) return items;
    return recommendations.map((rec) => rec.item) as RebangHotItem[];
  }, [items, recommendationMode, recommendations]);

  const applySnapshot = useCallback(
    (snapshot: {
      run?: HotRunInfo | null;
      records?: HotRecommendationRecord[];
    } | null) => {
      if (!snapshot) return;
      setRecommendations(snapshot.records ?? []);
      if (snapshot.run?.profile) {
        // run.profile 是同步快照，画像面板优先以 /api/profile 为准
        // 但首次加载也用它兜底
        setUserProfile((curr) => curr ?? snapshot.run!.profile!);
      }
      setRunInfo(snapshot.run ?? null);
    },
    []
  );

  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setUserProfile(json.profile ?? null);
      setProfileOverrides(json.overrides ?? []);
    } catch {
      // 静默失败
    }
  }, []);

  const updateTag = useCallback(
    async (
      action: "addTag" | "removeTag" | "deleteOverride",
      payload: {
        tagType?: ProfileTagType;
        tagValue?: string;
        overrideId?: number;
      }
    ) => {
      if (profileBusy) return;
      setProfileBusy(true);
      try {
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "操作失败");
        setUserProfile(json.profile ?? null);
        setProfileOverrides(json.overrides ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      } finally {
        setProfileBusy(false);
      }
    },
    [profileBusy]
  );

  const regenerateProfile = useCallback(async () => {
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "重新生成失败");
      setUserProfile(json.profile ?? null);
      setProfileOverrides(json.overrides ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新生成画像失败");
    } finally {
      setProfileBusy(false);
    }
  }, [profileBusy]);

  const handleAddTagSubmit = useCallback(
    async (type: ProfileTagType) => {
      const value = (tagInputs[type] ?? "").trim();
      if (!value) return;
      setTagInputs((prev) => ({ ...prev, [type]: "" }));
      await updateTag("addTag", { tagType: type, tagValue: value });
    },
    [tagInputs, updateTag]
  );

  const loadCachedRecommendations = useCallback(async () => {
    try {
      const res = await fetch("/api/recommendations/hot", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      applySnapshot(json);
    } catch {
      // 静默：初次加载失败不影响热榜主流程
    }
  }, [applySnapshot]);

  const generateRecommendations = useCallback(
    async (force = false) => {
      if (recommending) return;
      setRecommending(true);
      setRecommendationMode(true);
      setActiveStep(0);
      setError(null);

      const timers: number[] = [];
      const advance = (step: number, ms: number) => {
        timers.push(
          window.setTimeout(() => {
            setActiveStep((curr) => (curr < step ? step : curr));
          }, ms)
        );
      };
      // 阶段进度以“预期耗时”推进，实际返回后会被清除并快进到完成
      advance(1, 4000);
      advance(2, 9000);
      advance(3, 14000);
      advance(4, 24000);

      try {
        const res = await fetch("/api/recommendations/hot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "推荐失败");
        // 计算完成，立即替换列表，进度条跳到完成状态
        applySnapshot(json);
        setActiveStep(RECOMMEND_STEPS.length);
      } catch (e) {
        setError(e instanceof Error ? e.message : "推荐失败");
        setActiveStep(-1);
      } finally {
        timers.forEach((id) => window.clearTimeout(id));
        setRecommending(false);
        // 1.5 秒后隐藏进度条
        window.setTimeout(() => {
          setActiveStep((curr) =>
            curr === RECOMMEND_STEPS.length ? -1 : curr
          );
        }, 1500);
      }
    },
    [recommending, applySnapshot]
  );

  useEffect(() => {
    void loadCachedRecommendations();
    void fetchUserProfile();
  }, [loadCachedRecommendations, fetchUserProfile]);

  const sendFeedback = async (item: RebangHotItem, kind: InterestKind) => {
    const source = itemSourceMap.get(item.item_key) ?? sourceName;
    setFeedbackKeys((prev) => ({ ...prev, [item.item_key]: kind }));
    try {
      const res = await fetch("/api/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          item: {
            ...item,
            source,
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
        </div>
      </header>

      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => setRecommendationMode((v) => !v)}
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
                onClick={() => {
                  setRecommendationMode(false);
                  setSubTab(st.key);
                }}
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
            {recommendationMode ? (
              <li className="rounded-2xl border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles
                    className={cn(
                      "h-4 w-4 text-accent",
                      recommending && "animate-pulse"
                    )}
                  />
                  <span className="font-medium text-foreground">个性化推荐</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1.5"
                    onClick={regenerateProfile}
                    disabled={profileBusy}
                    title="使用 LLM 基于最新兴趣样本重新分析画像"
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5",
                        profileBusy && "animate-spin"
                      )}
                    />
                    {profileBusy ? "重生成中…" : "重新画像"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={() => generateRecommendations(true)}
                    disabled={recommending}
                  >
                    <Sparkles
                      className={cn(
                        "h-3.5 w-3.5",
                        recommending && "animate-pulse"
                      )}
                    />
                    {recommending ? "生成中…" : "立即更新"}
                  </Button>
                </div>
                {activeStep >= 0 ? (
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {RECOMMEND_STEPS.map((step, i) => {
                    const done =
                      i < activeStep ||
                      activeStep === RECOMMEND_STEPS.length;
                    const current =
                      i === activeStep &&
                      activeStep < RECOMMEND_STEPS.length;
                    return (
                      <div
                        key={step.key}
                        className="flex flex-col items-stretch gap-1"
                      >
                        <div
                          className={cn(
                            "h-1 rounded-full transition-colors",
                            done
                              ? "bg-accent"
                              : current
                              ? "bg-accent/60 animate-pulse"
                              : "bg-surface-2"
                          )}
                        />
                        <span
                          className={cn(
                            "text-center text-[10px] transition-colors",
                            done || current
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {userProfile?.summary ? (
                <p className="mt-3 text-foreground/80">
                  {userProfile.summary}
                </p>
              ) : null}
              {userProfile ? (
                <div className="mt-3 space-y-3">
                  {TAG_SECTIONS.map((section) => {
                    const values =
                      section.type === "identity"
                        ? userProfile.identity
                        : section.type === "domain"
                        ? userProfile.domains.map((d) => d.name)
                        : section.type === "style"
                        ? userProfile.styles
                        : userProfile.avoid;
                    const domainMap = new Map(
                      userProfile.domains.map((d) => [d.name, d])
                    );
                    return (
                      <div key={section.type}>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-foreground">
                            {section.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {values.length} 项
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {values.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              {section.empty}
                            </span>
                          ) : (
                            values.map((value) => {
                              const domain =
                                section.type === "domain"
                                  ? domainMap.get(value)
                                  : null;
                              return (
                                <span
                                  key={value}
                                  className={cn(
                                    "group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                                    section.badgeClass
                                  )}
                                  title={
                                    domain && domain.subtopics.length
                                      ? `子话题: ${domain.subtopics.join(
                                          "、"
                                        )} · 权重 ${(domain.weight * 100).toFixed(
                                          0
                                        )}%`
                                      : undefined
                                  }
                                >
                                  {value}
                                  {domain ? (
                                    <span className="text-[9px] opacity-60">
                                      {(domain.weight * 100).toFixed(0)}%
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="opacity-50 transition hover:opacity-100"
                                    onClick={() =>
                                      updateTag("removeTag", {
                                        tagType: section.type,
                                        tagValue: value,
                                      })
                                    }
                                    disabled={profileBusy}
                                    title="移除"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })
                          )}
                          <form
                            className="inline-flex items-center"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void handleAddTagSubmit(section.type);
                            }}
                          >
                            <input
                              type="text"
                              value={tagInputs[section.type]}
                              onChange={(e) =>
                                setTagInputs((prev) => ({
                                  ...prev,
                                  [section.type]: e.target.value,
                                }))
                              }
                              placeholder="+ 添加"
                              className="h-6 w-20 rounded-full border border-dashed border-border bg-transparent px-2 text-[11px] outline-none focus:border-accent focus:w-32"
                              disabled={profileBusy}
                            />
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3">
                  继续在热榜里点「感兴趣 / 不感兴趣」积累样本，我会自动构建你的画像。
                </p>
              )}
              </li>
            ) : null}
            {recommendationMode && recommendations.length === 0 && !recommending ? (
              <li className="rounded-2xl border border-dashed border-border bg-surface-1 p-6 text-center text-sm text-muted-foreground">
                {userProfile && userProfile.stats.total > 0
                  ? "还没有生成过推荐。点击右上「立即更新」试试。"
                  : "还没有足够的兴趣样本。先在热榜里点几条「感兴趣」，我就能开始学习。"}
              </li>
            ) : null}
            {visibleItems.map((item, index) => {
              const rec = recommendationMap.get(item.item_key);
              const feedback = feedbackKeys[item.item_key];
              const itemSource = itemSourceMap.get(item.item_key) ?? sourceName;
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
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">
                            {itemSource}
                          </span>
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
                          className={cn(
                            "h-7 w-7",
                            feedback === "read_later" && "bg-accent/10 text-accent"
                          )}
                          title="稍后看"
                          onClick={() => sendFeedback(item, "read_later")}
                        >
                          <Bookmark className="h-3.5 w-3.5" />
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
                        {rec.recallChannels && rec.recallChannels.length > 0 ? (
                          <div className="mb-1 flex flex-wrap gap-1">
                            {rec.recallChannels.map((ch) => (
                              <span
                                key={ch}
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[9px]",
                                  ch === "exploration"
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                                    : "bg-surface-2 text-muted-foreground"
                                )}
                              >
                                {RECALL_CHANNEL_LABEL[ch]}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="text-foreground/80">{rec.reason}</p>
                        {rec.featureScores ? (
                          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                            {(
                              [
                                ["domainMatch", "领域"],
                                ["styleMatch", "风格"],
                                ["novelty", "新颖"],
                                ["quality", "质量"],
                              ] as const
                            ).map(([key, label]) => {
                              const v = rec.featureScores?.[key] ?? 0;
                              return (
                                <div key={key} className="flex flex-col gap-0.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px]">{label}</span>
                                    <span className="text-[9px] tabular-nums">
                                      {Math.round(v * 100)}
                                    </span>
                                  </div>
                                  <div className="h-1 rounded-full bg-surface-2">
                                    <div
                                      className="h-full rounded-full bg-accent/70"
                                      style={{
                                        width: `${Math.max(0, Math.min(100, v * 100))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {rec.matchedInterests.length ? (
                            <span>
                              匹配兴趣：{rec.matchedInterests.slice(0, 2).join("、")}
                            </span>
                          ) : null}
                          {rec.firstRecommendedAt ? (
                            <span>首次进入推荐 {formatRelative(rec.firstRecommendedAt)}</span>
                          ) : null}
                        </div>
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
