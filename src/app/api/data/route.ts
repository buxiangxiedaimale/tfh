import { NextResponse } from "next/server";
import { readServerPayload, writeServerPayload } from "@/lib/server-data/store";
import type { SyncPayload } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await readServerPayload();
    return NextResponse.json({ payload });
  } catch (error) {
    console.error("Failed to read server data", error);
    return NextResponse.json({ error: "读取服务器数据失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { payload?: SyncPayload };
    if (!body.payload) {
      return NextResponse.json({ error: "缺少 payload" }, { status: 400 });
    }
    await writeServerPayload(body.payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to write server data", error);
    return NextResponse.json({ error: "保存服务器数据失败" }, { status: 500 });
  }
}
