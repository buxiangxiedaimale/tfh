#!/usr/bin/env bash
# FlowTodo 国内服务器推荐安装（不用 Docker/Podman）
# 用法: chmod +x install.sh && ./install.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "=========================================="
echo "  FlowTodo 安装（Node 直跑，无需容器）"
echo "=========================================="

# --- Node.js ---
need_node() {
  command -v node >/dev/null 2>&1 || return 0
  local major
  major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  [ "$major" -lt 18 ] 2>/dev/null
}

if need_node; then
  echo "==> 安装 Node.js 20..."
  if command -v dnf >/dev/null 2>&1; then
  dnf module reset nodejs -y 2>/dev/null || true
  if dnf module enable nodejs:20 -y 2>/dev/null; then
    dnf install -y nodejs npm
  else
    dnf install -y nodejs npm || yum install -y nodejs npm
  fi
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nodejs npm
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y nodejs npm
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 未安装 Node。可手动安装 18+ 后重试。"
  exit 1
fi
echo "    Node: $(node -v)  npm: $(npm -v)"

# --- 环境变量 ---
if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "==> 已创建 .env.local（密钥可稍后配置）"
fi

# --- 依赖与构建 ---
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
npm config set registry https://registry.npmmirror.com

echo "==> 安装依赖..."
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

echo "==> 构建生产包（约 1–3 分钟）..."
npm run build

# --- PM2 ---
if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> 安装 PM2..."
  npm install -g pm2 --registry=https://registry.npmmirror.com
fi

echo "==> 启动服务..."
pm2 delete flowtodo 2>/dev/null || true
HOSTNAME=0.0.0.0 PORT=3000 pm2 start npm --name flowtodo -- start
pm2 save

STARTUP="$(pm2 startup 2>&1 | grep -E 'sudo.*pm2' | tail -1 || true)"
if [ -n "$STARTUP" ]; then
  echo "==> 开机自启（请执行下面这一行）:"
  echo "    $STARTUP"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "=========================================="
echo "  安装完成"
echo "  本机: curl http://127.0.0.1:3000"
echo "  外网: http://${IP:-你的公网IP}:3000"
echo "  安全组放行: TCP 3000"
echo ""
echo "  pm2 status"
echo "  pm2 logs flowtodo"
echo "=========================================="
