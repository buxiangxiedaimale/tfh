import { NextResponse } from "next/server";
import { fetchMenuTabs, REBANG_UNSUPPORTED_HINT } from "@/lib/rebang/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchMenuTabs();
    const unsupported = new Set(Object.keys(REBANG_UNSUPPORTED_HINT));
    const filteredHomeTabs = data.homeTabs.filter(
      (t) => !unsupported.has(t.key)
    );
    const filteredMenus = data.menus.map((m) => ({
      ...m,
      tab_info: m.tab_info?.filter((t) => !unsupported.has(t.key)) ?? [],
    }));
    return NextResponse.json({
      data: { menus: filteredMenus, homeTabs: filteredHomeTabs },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "获取热榜分类失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
