#!/usr/bin/env bash
# FlowTodo 推送到 GitHub
# 用法: ./scripts/push-to-github.sh https://github.com/你的用户名/flowtodo.git

set -euo pipefail
REPO_URL="${1:?请传入仓库地址，例如 https://github.com/user/flowtodo.git}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null; then
  echo "请先安装 Git: https://git-scm.com/"
  exit 1
fi

if [ ! -d .git ]; then
  git init
  git branch -M main
fi

if [ -f .env.local ] && git ls-files --error-unmatch .env.local >/dev/null 2>&1; then
  git rm --cached .env.local
fi

git add -A
if [ -n "$(git status --porcelain)" ]; then
  git commit -m "feat: FlowTodo 待办应用（Next.js + 同步 + 小记 + 热榜）"
fi

if git remote | grep -q '^origin$'; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

git push -u origin main
echo "完成: $REPO_URL"
