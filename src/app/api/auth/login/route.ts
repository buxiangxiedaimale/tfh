import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  makeAuthToken,
  siteAuthEnabled,
  sitePassword,
} from "@/lib/site-auth";

export async function POST(request: Request) {
  if (!siteAuthEnabled()) {
    return NextResponse.json({ ok: true });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }

  const input = body.password?.trim() ?? "";
  const expected = sitePassword();

  if (input !== expected) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const token = await makeAuthToken(expected);
  const res = NextResponse.json({ ok: true });
  const secure = new URL(request.url).protocol === "https:";

  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return res;
}
