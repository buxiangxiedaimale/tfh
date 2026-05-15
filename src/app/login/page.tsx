"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "登录失败");
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-canvas flex min-h-[100dvh] items-center justify-center px-4">
      <div className="elevated-md w-full max-w-sm rounded-3xl border border-border/60 bg-surface-1 p-8">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-indigo-400 text-white shadow-lg">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          FlowTodo
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          请输入访问密码以继续
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Input
            type="password"
            placeholder="访问密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          {error ? (
            <p className="text-center text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? "验证中…" : "进入应用"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="app-canvas flex min-h-[100dvh] items-center justify-center text-muted-foreground">
          加载中…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
