import type {
  RebangApiResponse,
  RebangHotItem,
  RebangItemsData,
  RebangMenu,
  RebangTab,
} from "@/lib/rebang/types";

const API_BASE = "https://api.rebang.today/v1";
const CDN_BASE = "https://cdn.rebang.today";
const IMG_BASE = "https://img.rebang.today";

export const REBANG_FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://rebang.today",
  Referer: "https://rebang.today/home",
  Accept: "application/json",
};

const FETCH_OPTS: RequestInit = {
  headers: REBANG_FETCH_HEADERS,
  cache: "no-store",
};

/** 微博等：仅 version=2 + sub_tab，不要 date_type */
const VERSION_2_TABS = new Set(["weibo"]);

/** 有子榜时通常需要 date_type=now（虎扑、贴吧等） */
const PREFER_DATE_WITH_SUB = new Set([
  "hupu",
  "v2ex",
  "ithome",
  "juejin",
  "douban-community",
  "douban-media",
  "baidu-tieba",
  "sspai",
  "36kr",
  "bilibili",
  "landian",
  "ne-news",
  "weread",
  "xueqiu",
  "baidu",
]);

/** 菜单里无 child，但接口仍要求 sub_tab */
export const LEAF_TAB_DEFAULT_SUB: Record<string, string> = {
  "tencent-news": "hot",
};

/** 开放 API 长期返回 1001 的平台（会仍尝试多种参数） */
export const REBANG_UNSUPPORTED_HINT: Record<string, string> = {
  smzdm: "什么值得买",
  github: "GitHub",
  "zhihu-daily": "知乎日报",
};

const TOP_SUB_TAB_KEYS = ["today", "weekly", "monthly"] as const;

type QueryStyle = "sub_only" | "sub_with_date" | "date_only" | "minimal";

async function rebangFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, FETCH_OPTS);

  if (!res.ok) {
    throw new Error(`热榜接口请求失败: ${res.status}`);
  }

  const json = (await res.json()) as RebangApiResponse<T>;
  if (json.code !== 200) {
    throw new Error(json.msg || "热榜接口返回错误");
  }

  return json.data;
}

export function parseItemsList(
  list: RebangItemsData["list"] | string
): RebangHotItem[] {
  if (Array.isArray(list)) return list;
  if (typeof list === "string") {
    try {
      return JSON.parse(list) as RebangHotItem[];
    } catch {
      return [];
    }
  }
  return [];
}

function resolveApiVersion(tabKey: string, override?: number): number {
  if (override !== undefined) return override;
  return VERSION_2_TABS.has(tabKey) ? 2 : 1;
}

export function resolveSubTab(
  tabKey: string,
  subTab: string | undefined,
  tabMeta?: RebangTab | null
): string | undefined {
  if (tabKey === "top") {
    if (
      subTab &&
      TOP_SUB_TAB_KEYS.includes(subTab as (typeof TOP_SUB_TAB_KEYS)[number])
    ) {
      return subTab;
    }
    if (subTab === "week") return "weekly";
    if (subTab === "month") return "monthly";
    return "today";
  }

  const children = tabMeta?.child ?? [];
  if (children.length > 0) {
    const keys = children.map((c) => c.key);
    if (subTab && keys.includes(subTab)) return subTab;
    const def = children.find((c) => c.current_show) ?? children[0];
    return def.key;
  }

  if (subTab) return subTab;
  return LEAF_TAB_DEFAULT_SUB[tabKey];
}

function subTabCandidates(
  tabKey: string,
  subTab: string | undefined,
  tabMeta?: RebangTab | null
): (string | undefined)[] {
  const primary = resolveSubTab(tabKey, subTab, tabMeta);
  const list: (string | undefined)[] = [];

  const push = (s: string | undefined) => {
    if (s !== undefined && !list.includes(s)) list.push(s);
    if (s === undefined && !list.includes(undefined)) list.push(undefined);
  };

  push(primary);

  if (!tabMeta?.child?.length) {
    for (const guess of ["hot", "today", "search", "realtime"]) {
      push(guess);
    }
    push(undefined);
  }

  return list;
}

function buildAttempts(
  tabKey: string,
  page: number,
  subCandidates: (string | undefined)[]
): { version: number; sub?: string; style: QueryStyle }[] {
  const attempts: { version: number; sub?: string; style: QueryStyle }[] = [];
  const versions = VERSION_2_TABS.has(tabKey) ? [2, 1] : [1, 2];

  const add = (
    version: number,
    sub: string | undefined,
    style: QueryStyle
  ) => {
    if (
      (style === "sub_only" || style === "sub_with_date") &&
      !sub
    ) {
      return;
    }
    const key = `${version}|${sub ?? ""}|${style}`;
    if (
      attempts.some(
        (a) => `${a.version}|${a.sub ?? ""}|${a.style}` === key
      )
    ) {
      return;
    }
    attempts.push({ version, sub, style });
  };

  for (const version of versions) {
    if (tabKey === "top") {
      for (const sub of subCandidates) {
        if (sub) add(version, sub, "sub_only");
      }
      continue;
    }

    if (VERSION_2_TABS.has(tabKey)) {
      for (const sub of subCandidates) {
        if (sub) add(version, sub, "sub_only");
      }
      continue;
    }

    for (const sub of subCandidates) {
      if (sub) {
        if (PREFER_DATE_WITH_SUB.has(tabKey)) {
          add(version, sub, "sub_with_date");
          add(version, sub, "sub_only");
        } else {
          add(version, sub, "sub_only");
          add(version, sub, "sub_with_date");
        }
      } else {
        add(version, undefined, "date_only");
        add(version, undefined, "minimal");
      }
    }
  }

  return attempts;
}

function buildQueryString(
  tabKey: string,
  version: number,
  page: number,
  subTab: string | undefined,
  style: QueryStyle
): string {
  const params = new URLSearchParams({
    tab: tabKey,
    page: String(page),
    version: String(version),
  });

  if (style === "sub_only" || style === "sub_with_date") {
    if (subTab) params.set("sub_tab", subTab);
  }
  if (style === "sub_with_date" || style === "date_only") {
    params.set("date_type", "now");
  }

  return params.toString();
}

function isInvalidParamError(status: number, msg?: string): boolean {
  return (
    status === 400 ||
    Boolean(msg?.includes("invalid request parameter")) ||
    Boolean(msg?.includes("1001"))
  );
}

async function fetchHotItemsOnce(
  query: string
): Promise<RebangItemsData> {
  const res = await fetch(`${API_BASE}/items?${query}`, FETCH_OPTS);

  const json = (await res.json()) as RebangApiResponse<
    Omit<RebangItemsData, "list"> & { list: unknown }
  >;

  if (!res.ok || json.code !== 200) {
    const err = new Error(
      json.msg || `热榜接口请求失败: ${res.status}`
    ) as Error & { status?: number; rebangCode?: number };
    err.status = res.status;
    err.rebangCode = json.code;
    throw err;
  }

  return {
    ...json.data,
    list: parseItemsList(json.data.list as string | RebangHotItem[]),
  };
}

export async function fetchHotItems(
  tabKey: string,
  options?: { subTab?: string; page?: number; tabMeta?: RebangTab | null }
): Promise<RebangItemsData> {
  const page = options?.page ?? 1;
  const subs = subTabCandidates(
    tabKey,
    options?.subTab,
    options?.tabMeta ?? null
  );
  const attempts = buildAttempts(tabKey, page, subs);

  let lastError: Error | null = null;

  for (const { version, sub, style } of attempts) {
    const query = buildQueryString(tabKey, version, page, sub, style);
    try {
      return await fetchHotItemsOnce(query);
    } catch (e) {
      const err = e as Error & { status?: number };
      lastError = err;
      if (!isInvalidParamError(err.status ?? 0, err.message)) {
        throw err;
      }
    }
  }

  const hint = REBANG_UNSUPPORTED_HINT[tabKey];
  if (hint) {
    throw new Error(
      `${hint} 暂未通过 rebang 开放接口提供数据，请稍后在 rebang.today 查看`
    );
  }

  throw lastError ?? new Error("获取热榜失败");
}

export async function fetchMenuTabs(): Promise<{
  menus: RebangMenu[];
  homeTabs: RebangTab[];
}> {
  const data = await rebangFetch<{
    menu_tabs: RebangMenu[];
    update_flag: string;
  }>("/menu_tabs?update_flag=");

  const home = data.menu_tabs.find((m) => m.menu_key === "home");
  return {
    menus: data.menu_tabs,
    homeTabs: home?.tab_info ?? [],
  };
}

export function tabIconUrl(tab: RebangTab | string, _dark = false): string {
  const avatar = typeof tab === "string" ? tab : tab.avatar;
  const name = typeof tab === "string" ? "" : tab.name;
  if (!avatar) return "";
  const q = new URLSearchParams({ path: avatar });
  if (name) q.set("label", name);
  return `/api/rebang/icon?${q.toString()}`;
}

export function itemImageUrl(image: string): string {
  if (!image) return "";
  const q = new URLSearchParams({
    path: image,
    kind: image.startsWith("http") ? "cdn" : "img",
  });
  return `/api/rebang/icon?${q.toString()}`;
}
