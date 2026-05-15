import { NextResponse } from "next/server";
import { fetchMenuTabs } from "@/lib/rebang/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchMenuTabs();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "获取热榜分类失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
