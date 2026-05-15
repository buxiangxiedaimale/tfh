#!/usr/bin/env bash
# FlowTodo 一键部署
#   ./deploy.sh          容器部署（自动识别 Podman / Docker）
#   ./deploy.sh podman   强制使用 Podman
#   ./deploy.sh node     不用容器，Node + PM2

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
MODE="${1:-auto}"

echo "==> FlowTodo 部署"
echo "    目录: $APP_DIR"

if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.local
    echo "==> 已创建 .env.local（密钥可选，不填也能运行基础功能）"
  fi
fi

# 解析 compose 命令：podman compose | podman-compose | docker compose | docker-compose
resolve_compose() {
  local try=("$@")
  local c
  for c in "${try[@]}"; do
    if $c version >/dev/null 2>&1; then
      COMPOSE="$c"
      return 0
    fi
  done
  return 1
}

install_podman_stack() {
  echo "==> 安装 Podman（未检测到容器运行时）..."
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y podman podman-compose 2>/dev/null \
      || dnf install -y podman docker-compose 2>/dev/null \
      || yum install -y podman podman-compose
  elif command -v yum >/dev/null 2>&1; then
    yum install -y podman podman-compose 2>/dev/null || yum install -y podman
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y podman podman-compose
  else
    echo "    请手动安装: podman + podman-compose"
    return 1
  fi
}

detect_runtime() {
  RUNTIME=""
  COMPOSE=""

  if [ "$MODE" = "podman" ] || [ "$MODE" = "auto" ]; then
    if command -v podman >/dev/null 2>&1; then
      RUNTIME="podman"
      resolve_compose \
        "podman compose" \
        "podman-compose" \
        || true
    fi
  fi

  if [ -z "$COMPOSE" ] && { [ "$MODE" = "docker" ] || [ "$MODE" = "auto" ]; }; then
    if command -v docker >/dev/null 2>&1; then
      if docker info 2>/dev/null | grep -qi podman; then
        RUNTIME="podman (docker 兼容命令)"
      else
        RUNTIME="docker"
      fi
      resolve_compose \
        "docker compose" \
        "docker-compose" \
        || true
    fi
  fi

  if [ -z "$COMPOSE" ]; then
    install_podman_stack || true
    if command -v podman >/dev/null 2>&1; then
      RUNTIME="podman"
      resolve_compose "podman compose" "podman-compose" || true
    fi
  fi

  if [ -z "$COMPOSE" ]; then
    echo "==> 未找到 Podman/Docker 或 compose 工具。"
    echo "    阿里云可执行: dnf install -y podman podman-compose"
    echo "    或改用: ./deploy.sh node"
    exit 1
  fi
}

deploy_container() {
  detect_runtime
  echo "==> 运行时: $RUNTIME"
  echo "==> Compose: $COMPOSE"

  # 国内默认用 DaoCloud 镜像，避免 docker.io 超时
  export NODE_IMAGE="${NODE_IMAGE:-docker.m.daocloud.io/library/node:20-alpine}"
  echo "==> 基础镜像: $NODE_IMAGE"

  echo "==> 预拉取 Node 镜像..."
  if [[ "$RUNTIME" == podman* ]] && command -v podman >/dev/null 2>&1; then
    podman pull "$NODE_IMAGE" || true
  fi

  echo "==> 构建并启动容器（首次约 5–10 分钟）..."
  $COMPOSE down 2>/dev/null || true
  if [[ "$RUNTIME" == podman* ]]; then
    podman rm -f flowtodo 2>/dev/null || true
  fi
  $COMPOSE build
  $COMPOSE up -d

  echo ""
  echo "==> 容器已启动"
  echo "    状态: $COMPOSE ps"
  echo "    日志: $COMPOSE logs -f"
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local ver
    ver="$(node -p "process.versions.node.split('.')[0]")"
    if [ "$ver" -ge 18 ] 2>/dev/null; then
      return 0
    fi
    echo "    Node 版本过低 ($(node -v))，需要 18+"
  fi

  echo "==> 安装 Node.js..."
  if command -v dnf >/dev/null 2>&1; then
    dnf module enable nodejs:20 -y 2>/dev/null && dnf install -y nodejs npm && return 0
    dnf install -y nodejs npm 2>/dev/null && return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    yum install -y nodejs npm 2>/dev/null && return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y nodejs npm && return 0
  fi
  echo "    请手动安装 Node 18+"
  exit 1
}

deploy_node() {
  install_node
  echo "==> Node $(node -v)"

  if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2 --registry=https://registry.npmmirror.com
  fi

  npm ci --registry=https://registry.npmmirror.com 2>/dev/null \
    || npm install --registry=https://registry.npmmirror.com
  npm run build

  pm2 delete flowtodo 2>/dev/null || true
  HOSTNAME=0.0.0.0 PORT=3000 pm2 start npm --name flowtodo -- start
  pm2 save

  echo "    pm2 status / pm2 logs flowtodo"
}

show_done() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo ""
  echo "==> 访问: http://${ip:-你的公网IP}:3000"
  echo "    安全组放行 TCP 3000"
}

case "$MODE" in
  node|npm|pm2)
    deploy_node
    show_done
    ;;
  podman|docker)
    deploy_container
    show_done
    ;;
  auto|"")
    if [ -f /etc/redhat-release ] || [ -f /etc/alinux-release ]; then
      echo "==> 阿里云/CentOS：跳过容器，使用 Node 直跑"
      exec bash "$APP_DIR/install.sh"
    fi
    deploy_container
    show_done
    ;;
  *)
    echo "用法: ./deploy.sh [node|podman|docker|auto]"
    echo "  推荐: ./install.sh  或  ./deploy.sh node"
    exit 1
    ;;
esac
