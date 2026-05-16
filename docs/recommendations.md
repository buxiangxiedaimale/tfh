# 热榜推荐系统部署与运维

本文档描述工业级推荐系统架构、部署步骤和阿里云 Linux 上的 cron 配置方法。

## 推荐管线总览

```
[兴趣样本]  →  ensureUserProfile (LLM 结构化画像)
                           ↓
[候选池]   →  recallCandidates  (五通道并行召回)
                           ↓
              rankCandidates    (LLM 多维精排: domain/style/novelty/quality)
                           ↓
              applyRerank       (MMR 多样性 + 探索注入 + 同源约束)
                           ↓
              saveRun + bumpExposures
```

## 用户画像 (UserProfile)

由 DeepSeek 基于兴趣样本生成的结构化画像：

```ts
{
  identity: ["软件工程师", "AI 创业者"],
  domains: [
    { name: "AI/大模型", weight: 0.9, subtopics: ["DeepSeek", "Embedding"] }
  ],
  styles: ["深度技术解析", "上手教程"],
  avoid: ["明星八卦"],
  summary: "技术深度学习者，关注 AI 与工程实践",
}
```

- **生成策略**：兴趣库每新增 ≥10 条样本自动触发 LLM 重算；用户可手动点「重新画像」强制更新。
- **手动覆盖**：`profile_overrides` 表记录用户对每个标签的「添加 / 移除」动作，重新生成画像时不会丢失。
- **API**：`GET/POST /api/profile`（详见下方接口约定）。

## 多通道召回 (RecallChannel)

| 通道 | 触发条件 |
|---|---|
| `domain` | 候选命中画像 domains 的关键词或与画像中心向量相似度高 |
| `identity` | 候选命中 identity 标签 |
| `style` | 候选命中 styles 关键词 |
| `freshness` | 候选首次进入推荐池 < 24h |
| `exploration` | 高热度（≥5万）但当前画像未命中 |

命中 `avoid` 标签的候选硬过滤掉。

## LLM 多维精排

每条候选获得：

- **domainMatch** 领域匹配 (0~1)
- **styleMatch** 风格匹配 (0~1)
- **novelty** 新颖度 (0~1)
- **quality** 内容质量 (0~1)
- **llmOverall** LLM 综合分 (0~1)
- **baseScore** 粗排基础分（语义 + 召回信号）

最终分 = 加权融合，叠加曝光疲劳衰减（已有正反馈的不衰减）。

## MMR 重排 + 探索

- **lambda 0.72**：相关性 vs 多样性平衡
- **强制至少保留 2 条 exploration 候选**：扩展兴趣边界
- **同源 cap**：避免单源刷屏（默认无上限，可配置）

## 架构概览

```
+----------------+        +----------------------+
| 系统 cron      | -----> | /api/recommendations |
| 每小时一次     |  HTTP  |    /cron             |
+----------------+        +----------+-----------+
                                     |
                                     v
                       +-------------+-------------+
                       | runHotRecommendation()    |
                       |  - refreshHotPool()       |
                       |  - recommendHotItems()    |
                       |  - saveRun()              |
                       +-------------+-------------+
                                     |
                                     v
                          +----------+-----------+
                          |  SQLite (data/app.db)|
                          |  interests           |
                          |  embeddings          |
                          |  hot_pool            |
                          |  recommendation_runs |
                          |  recommendations     |
                          |  recommendation_      |
                          |   history            |
                          +----------------------+
```

- 候选池 1 天 TTL，按 url 去重，cron 每小时滚动合并新数据
- 推荐结果不限条数，硬上限 100 条；Top 50 走 DeepSeek 加权
- 用户点击"推荐"按钮 → `POST /api/recommendations/hot { force: true }` 强制重算（带 60 秒冷却）
- 用户打开热榜页面 → `GET /api/recommendations/hot` 返回最近一次结果，过期则后台异步刷新

## 持久化

所有推荐相关数据存在 `data/app.db`（SQLite，使用 `better-sqlite3`）。首次启动会自动从历史 `data/interests.json` 和 `data/embedding-cache.json` 迁移数据，迁移完成后老文件会重命名为 `*.json.migrated`，确认稳定后可删除。

## 环境变量

- `SILICONFLOW_API_KEY`：必需，向量化使用
- `DEEPSEEK_API_KEY`：可选，配置后启用 LLM 加权
- `DEEPSEEK_MODEL`：可选，默认 `deepseek-chat`
- `EMBEDDING_MODEL`：可选，默认 `Pro/BAAI/bge-m3`
- `CRON_SECRET`：建议配置，cron 接口鉴权

## 安装依赖

```bash
npm install
```

`better-sqlite3` 是原生模块，阿里云 Linux 上首次安装需要确保有 `gcc-c++`、`make` 和 `python3`：

```bash
# CentOS/Aliyun Linux
sudo yum install -y gcc-c++ make python3
```

## 启动

```bash
npm run build
npm run start  # 默认监听 3000
# 或 pm2
pm2 start "npm run start" --name flowtodo
```

## 配置 cron（每小时刷新）

编辑 crontab：

```bash
crontab -e
```

加入：

```
0 * * * * curl -s -m 120 -H "X-Cron-Secret: ${CRON_SECRET}" http://127.0.0.1:3000/api/recommendations/cron >> /var/log/flowtodo-cron.log 2>&1
```

要求：

- `${CRON_SECRET}` 与应用环境变量一致
- 超时设到 120 秒，覆盖完整推荐流程
- 日志写到 `/var/log/flowtodo-cron.log`，便于排查

## 接口约定

### `GET /api/recommendations/hot`

读取最近一次推荐结果。如果没有任何运行记录，会同步触发一次生成；如果运行记录已超过 1 小时，会在后台异步触发刷新（仍返回旧结果）。

返回：

```json
{
  "run": {
    "id": 12,
    "generatedAt": "2026-05-16T02:00:00Z",
    "durationMs": 8230,
    "candidateCount": 540,
    "resultCount": 36,
    "trigger": "cron",
    "configured": true,
    "profile": { ... }
  },
  "records": [
    {
      "itemKey": "...",
      "url": "...",
      "score": 0.86,
      "baseScore": 0.78,
      "llmScore": 0.92,
      "reason": "...",
      "matchedInterests": ["..."],
      "firstRecommendedAt": "2026-05-15T13:00:00Z",
      "lastRecommendedAt": "2026-05-16T02:00:00Z",
      "item": { /* 完整热搜项 */ }
    }
  ],
  "pool": { "total": 540 }
}
```

### `POST /api/recommendations/hot`

请求体：

- `{ "force": false }` 或省略：与 GET 行为一致
- `{ "force": true }`：强制重算（候选池立即刷新 + 重新打分）。60 秒冷却内会返回 `cooldown: true` 和最近一次结果

### `POST /api/recommendations/cron`（也支持 GET）

cron 调用入口。需要 `X-Cron-Secret` 头或 `?secret=` 参数与 `CRON_SECRET` 一致。本地（127.0.0.1/localhost）调用即使未配置 secret 也允许。

## 失效与重置

清除候选池：

```sql
DELETE FROM hot_pool;
```

清除推荐历史（保留兴趣库和 embedding 缓存）：

```sql
DELETE FROM recommendations;
DELETE FROM recommendation_runs;
DELETE FROM recommendation_history;
```

完全重置：直接删除 `data/app.db`，下次启动会自动重建表结构。
