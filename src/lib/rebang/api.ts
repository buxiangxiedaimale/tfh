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

const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://rebang.today",
  Referer: "https://rebang.today/home",
  Accept: "application/json",
};

async function rebangFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: DEFAULT_HEADERS,
    next: { revalidate: 300 },
  });

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

/** 部分平台（如微博）仅支持 version=2 */
const PREFER_VERSION_2 = new Set(["weibo"]);

function resolveApiVersion(tabKey: string, override?: number): number {
  if (override !== undefined) return override;
  return PREFER_VERSION_2.has(tabKey) ? 2 : 1;
}

export function buildItemsPath(
  tabKey: string,
  options?: {
    subTab?: string;
    page?: number;
    tabMeta?: RebangTab | null;
    version?: number;
  }
): string {
  const page = options?.page ?? 1;
  const version = resolveApiVersion(tabKey, options?.version);
  const params = new URLSearchParams({
    tab: tabKey,
    page: String(page),
    version: String(version),
  });

  const meta = options?.tabMeta;
  const childKey =
    options?.subTab ??
    meta?.child?.find((c) => c.current_show)?.key ??
    meta?.child?.[0]?.key;

  if (tabKey === "top") {
    params.set("sub_tab", options?.subTab ?? "today");
  } else if (childKey) {
    params.set("sub_tab", childKey);
  } else {
    params.set("date_type", "now");
  }

  return `/items?${params.toString()}`;
}

function isInvalidParamError(status: number, msg?: string): boolean {
  return (
    status === 400 ||
    Boolean(msg?.includes("invalid request parameter")) ||
    Boolean(msg?.includes("1001"))
  );
}

async function fetchHotItemsOnce(
  tabKey: string,
  options?: {
    subTab?: string;
    page?: number;
    tabMeta?: RebangTab | null;
    version?: number;
  }
): Promise<RebangItemsData> {
  const path = buildItemsPath(tabKey, options);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: DEFAULT_HEADERS,
    next: { revalidate: 300 },
  });

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

export async function fetchHotItems(
  tabKey: string,
  options?: { subTab?: string; page?: number; tabMeta?: RebangTab | null }
): Promise<RebangItemsData> {
  const primary = resolveApiVersion(tabKey);
  const fallback = primary === 1 ? 2 : 1;
  const versions = [primary, fallback];

  let lastError: Error | null = null;

  for (const version of versions) {
    try {
      return await fetchHotItemsOnce(tabKey, { ...options, version });
    } catch (e) {
      const err = e as Error & { status?: number; rebangCode?: number };
      lastError = err;
      const msg = err.message;
      if (
        versions.indexOf(version) < versions.length - 1 &&
        isInvalidParamError(err.status ?? 0, msg)
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("获取热榜失败");
}

export function tabIconUrl(avatar: string, dark = false): string {
  if (!avatar) return "";
  const path = avatar.startsWith("http") ? avatar : `${CDN_BASE}/${avatar}`;
  return path;
}

export function itemImageUrl(image: string): string {
  if (!image) return "";
  if (image.startsWith("http")) return image;
  return `${IMG_BASE}/${image}`;
}
