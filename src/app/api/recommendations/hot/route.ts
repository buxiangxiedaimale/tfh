import { NextResponse } from "next/server";
import { recommendHotItems } from "@/lib/recommendation/hot-recommend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: Parameters<typeof recommendHotItems>[0];
    };
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "缺少热搜候选列表" }, { status: 400 });
    }
    const result = await recommendHotItems(body.items);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
