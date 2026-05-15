import { NextResponse } from "next/server";
import { fetchHotItems, fetchMenuTabs } from "@/lib/rebang/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab");
  const subTab = searchParams.get("sub_tab") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  if (!tab) {
    return NextResponse.json({ error: "缺少 tab 参数" }, { status: 400 });
  }

  try {
    const { homeTabs } = await fetchMenuTabs();
    const tabMeta = homeTabs.find((t) => t.key === tab) ?? null;
    const data = await fetchHotItems(tab, { subTab, page, tabMeta });
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "获取热榜数据失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
