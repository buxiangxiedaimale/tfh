#!/usr/bin/env bash
# FlowTodo 一键更新部署（拉代码 + 构建 + 重启）
# 首次部署请先: chmod +x install.sh && ./install.sh
# 之后每次: chmod +x update.sh && ./update.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "=========================================="
echo "  FlowTodo 一键更新"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: 未安装 git，请先: yum install -y git"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 未安装 Node，请先执行: ./install.sh"
  exit 1
fi

echo "==> 拉取最新代码..."
git fetch origin 2>/dev/null || true
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
git pull origin "$BRANCH" --rebase 2>/dev/null || git pull origin "$BRANCH" || git pull

if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "==> 已创建 .env.local，可按需编辑密钥"
fi

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
npm config set registry https://registry.npmmirror.com

echo "==> 安装依赖..."
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

echo "==> 生产构建（约 1–3 分钟）..."
npm run build

restarted=0

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe flowtodo >/dev/null 2>&1; then
    echo "==> 重启 PM2 (flowtodo)..."
    pm2 restart flowtodo
    pm2 save 2>/dev/null || true
    restarted=1
  fi
fi

if [ "$restarted" -eq 0 ]; then
  if command -v podman-compose >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
    echo "==> 重建并启动 Podman 容器..."
    podman-compose up -d --build
    restarted=1
  elif docker compose version >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
    echo "==> 重建并启动 Docker 容器..."
    docker compose up -d --build
    restarted=1
  fi
fi

if [ "$restarted" -eq 0 ]; then
  echo ""
  echo "WARN: 未找到运行中的 flowtodo，请首次执行:"
  echo "  chmod +x install.sh && ./install.sh"
  exit 1
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "=========================================="
echo "  更新完成"
echo "  访问: http://${IP:-127.0.0.1}:3000"
echo "  日志: pm2 logs flowtodo"
echo "=========================================="
