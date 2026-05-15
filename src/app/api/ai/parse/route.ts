import { NextResponse } from "next/server";
import type { ParsedTaskIntent } from "@/lib/ai/types";

const SYSTEM_PROMPT = `你是任务解析助手。将用户的自然语言转为 JSON，仅输出合法 JSON，不要 markdown。
字段说明：
- title: 任务标题（必填，简洁）
- description: 补充说明（可选）
- dueDate: 截止日期 YYYY-MM-DD（可选，根据「今天」「明天」「下周五」等推断，今天是 {{today}}）
- dueTime: 时间 HH:mm（可选）
- priority: "none"|"low"|"medium"|"high"（可选）
- projectName: 项目名猜测，如工作/生活/学习（可选）
- tags: 字符串数组（可选）
- recurrence: "none"|"daily"|"weekly"|"monthly"（可选）

示例输入：「明天下午3点高优先级开会准备季度汇报」
示例输出：{"title":"开会准备季度汇报","dueDate":"...","dueTime":"15:00","priority":"high","projectName":"工作"}`;

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 DEEPSEEK_API_KEY，请在 .env.local 中设置" },
      { status: 503 }
    );
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效请求体" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "请输入任务描述" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const system = SYSTEM_PROMPT.replace("{{today}}", today);

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `DeepSeek 请求失败: ${err}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "AI 无响应" }, { status: 502 });
    }

    const parsed = JSON.parse(content) as ParsedTaskIntent;
    if (!parsed.title?.trim()) {
      return NextResponse.json({ error: "无法解析任务标题" }, { status: 422 });
    }

    return NextResponse.json({ data: parsed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "解析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
