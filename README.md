# SiegeGuess

SiegeGuess 是一个 Rainbow Six Siege 职业选手竞猜游戏。当前题库包含 81 名经过审核的 Major 或 Six Invitational 冠军选手。

## 功能

- 单人竞猜、断线恢复和结算
- 选手搜索、个人统计和排行榜
- 登录、注册、访客战绩合并
- 公告与管理后台
- R6 数据审核、同步和 JSON 导入导出
- 多人源码与测试保留，但 Vercel 首发默认关闭

## 本地开发

需要 Node.js 22 及 pnpm 11。

```bash
pnpm install --frozen-lockfile
pnpm migrate
pnpm seed
pnpm dev
```

前端默认运行在 `http://localhost:5173`，API 默认运行在 `http://localhost:3000`。SQLite 可直接用于本地开发；多人功能需要 Redis，并需同时设置：

```dotenv
MULTIPLAYER_ENABLED=true
VITE_MULTIPLAYER_ENABLED=true
```

## 数据

审核种子位于 `server/src/db/seeds/players.json`，包含 81 名 Major 或 SI 冠军。生产数据库应从空 PostgreSQL 实例执行：

```bash
DB_CLIENT=pg DB_URL='postgresql://...' pnpm migrate
DB_CLIENT=pg DB_URL='postgresql://...' pnpm seed
```

`seed` 是幂等操作，会按 Liquipedia 来源身份更新种子记录。生产环境不迁移仓库外的本地 SQLite、历史停用选手或开发对局。

R6 数据策略和同步流程见：

- [R6_API_SYNC.md](docs/R6_API_SYNC.md)
- [R6_DATA_POLICY.md](docs/R6_DATA_POLICY.md)
- [R6_ROLLOUT.md](docs/R6_ROLLOUT.md)

## Vercel 部署

项目面向 Vercel Hobby：Vite 静态产物由 CDN 提供，`api/index.ts` 是 Express Serverless 入口。生产依赖 Neon PostgreSQL 和支持 TCP/TLS 的 Upstash Redis。

在 Vercel Preview 与 Production 环境配置以下变量，凭据不得写入仓库：

| 变量 | 值 |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_CLIENT` | `pg` |
| `DB_URL` | Neon 池化 PostgreSQL 连接串 |
| `DB_POOL_MIN` | `0` |
| `DB_POOL_MAX` | `1` |
| `REDIS_URL` | Upstash TCP/TLS 连接串，通常为 `rediss://...` |
| `REDIS_REQUIRED` | `true` |
| `JWT_SECRET` | 至少 32 字节的独立随机值 |
| `GUEST_ID_SALT` | 至少 32 字节且不同于 JWT 的随机值 |
| `CORS_ORIGINS` | 自定义域名；Vercel 当前部署域名会自动加入 |
| `TRUST_PROXY` | `true` |
| `MULTIPLAYER_ENABLED` | `false` |
| `VITE_MULTIPLAYER_ENABLED` | `false` |

首次部署前只需对目标 PostgreSQL 执行一次迁移和种子同步。应用函数只验证数据库结构，不在请求期间执行 DDL 或创建管理员账号。

本轮上线只应发布 Preview；确认 Preview、数据库和 Redis 均正常后，再单独决定是否发布 Production。

## 验证

```bash
pnpm install --frozen-lockfile
pnpm test:local
pnpm test
pnpm build
git diff --check
```

完整服务端测试需要 Redis 7.4 和 PostgreSQL 测试连接。负载与 WebSocket 基准工具继续保留在 `server/scripts/`。

## 许可

本项目基于 [AGPL-3.0](LICENSE) 开源。
