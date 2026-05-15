#!/usr/bin/env bash
# 国内服务器推荐：不装 Docker，直接 Node 部署
exec "$(dirname "$0")/../deploy.sh" node
