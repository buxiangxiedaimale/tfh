#!/usr/bin/env bash
# FlowTodo 一键部署（Linux 服务器）
# 用法: chmod +x deploy.sh && ./deploy.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "==> FlowTodo 部署"
echo "    目录: $APP_DIR"

# 1. 检查 Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "==> 未检测到 Docker，正在安装（Ubuntu/Debian）..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  echo "    Docker 已安装。若提示权限不足，请执行: newgrp docker  或重新登录 SSH"
fi

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
fi

# 2. 环境变量
if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.local
    echo "==> 已从 .env.example 生成 .env.local，请编辑后重新运行:"
    echo "    nano .env.local"
    exit 1
  else
    echo "==> 请创建 .env.local（Supabase / DeepSeek 等，可选）"
    exit 1
  fi
fi

# 3. 构建并启动
echo "==> 构建镜像并启动容器（首次约 3–8 分钟）..."
$COMPOSE up -d --build

echo ""
echo "==> 部署完成"
echo "    访问: http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
echo "    或:   http://你的服务器IP:3000"
echo ""
echo "常用命令:"
echo "  查看日志: $COMPOSE logs -f"
echo "  重启:     $COMPOSE restart"
echo "  停止:     $COMPOSE down"
echo "  更新代码后: git pull && ./deploy.sh"
