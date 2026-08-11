# SiegeGuess

Rainbow Six Siege 职业选手竞猜游戏，核心玩法类似 Wordle，并保留原项目的单人模式、实时多人对战、搜索、统计、回放、排行榜、公告和管理后台。

## 玩法

输入选手 ID 后，系统按以下九项给出对比反馈：

- 国家或地区
- 战队
- 年龄
- 位置
- Major 参赛次数
- Major 夺冠次数
- Six Invitational 参赛次数
- Six Invitational 夺冠次数
- 现役状态

绿色表示完全一致，黄色表示数值接近；年龄与四项赛事数值会用箭头提示答案更高或更低。8 次机会内猜出目标选手即获胜。一个选手可以有多个位置，位置集合完全一致为绿色、存在交集为黄色。爬虫缺失的资料显示为“未知”，未知值之间不会被判定为匹配。

## 难度池

- `beginner`：当前前端唯一开放的难度，包含经冠军阵容核验的 Major 或 Six Invitational 冠军选手。
- `easy`、`normal`：后端分池与接口继续保留，前端入口暂时关闭，供后续扩充题库时启用。

知名选手名单使用 Liquipedia 稳定来源 ID，位于 `server/src/config/r6KnownPlayers.json`。昵称只用于显示，不作为同步主键。

## 本地开发

要求 Node.js 22 或更高版本及 pnpm。SQLite 开箱即用；没有 Redis 时服务端会降级为仅适合单实例开发的内存模式。

```bash
pnpm install
pnpm dev
```

前端默认运行在 `http://localhost:5173`，服务端默认运行在 `http://localhost:3000`。

常用命令：

```bash
pnpm test:local
pnpm --filter server build
pnpm --filter client build
pnpm migrate
pnpm create-admin
```

当前阶段的 `test:local` 只覆盖本地 SQLite、服务逻辑和前端组件，不运行 Redis、PostgreSQL、Socket.IO 房间、观战、断线恢复、跨实例广播或负载测试。

## R6 选手数据

内置题库由 `D:\LiquipediaScraping\exports\major_si_champions.md` 与 `D:\LiquipediaScraping\data\verified_champion_rosters.json` 核验，共 81 名 Major 或 Six Invitational 冠军选手。选手详细字段来自同一次爬虫导出的 `players_major_si.json`，项目保留独立的 Major/SI 参赛与夺冠次数。

更新爬虫数据后，先用上述两份冠军来源核对名单，再从同批次 `players_major_si.json` 筛选冠军记录并覆盖 `server/src/db/seeds/players.json`，最后执行：

```bash
pnpm migrate
pnpm seed
```

旧的官方 API 快照同步工具仍保留用于后续数据源迁移：

正式数据来源为 Liquipedia 官方数据 API。应用运行时不会请求 Liquipedia，也不包含网页爬虫。API 审批期间使用本地快照完成标准化、审核和导入逻辑。

默认命令只生成产物，不修改数据库：

```bash
pnpm r6:sync --source snapshot --snapshot server/src/r6Sync/fixtures/snapshot.json
```

产物写入被 Git 忽略的 `server/data/r6-sync/<timestamp>/`：

- `snapshot.json`：原始输入快照。
- `normalized.json`：通过标准化和校验、可进入选手池的记录。
- `review.json`：待人工审核或被拒绝的记录及原因。
- `summary.json`：接纳、审核、拒绝以及 apply 后的新增、更新、停用统计。

确认 `review.json` 为空后，显式加 `--apply` 才会事务性写入当前配置的数据库：

```bash
pnpm r6:sync --source snapshot --snapshot path/to/snapshot.json --apply
```

完整同步会停用本次消失的 Liquipedia 选手，并在首次正式导入时停用没有官方来源 ID 的旧选手；历史对局不会删除。部分同步不会自动停用未出现在快照中的选手。

API 获批后只需实现真实传输适配器；快照结构、标准化、审核、难度分池和数据库导入保持不变。详细说明见 [R6_API_SYNC.md](docs/R6_API_SYNC.md)、[R6_DATA_POLICY.md](docs/R6_DATA_POLICY.md) 和 [R6_ROLLOUT.md](docs/R6_ROLLOUT.md)。

## 数据模型

官方选手使用 `source_provider + source_player_id` 作为同步身份，允许出现相同昵称。公共自动补全会显示“昵称 · 队伍 · 国家或地区”，提交使用选手 ID。

游戏统一读写独立的 `major_championships`、`major_appearances`、`si_championships`、`si_appearances` 和 `roles`。`major_si_*` 合计字段只用于兼容旧管理接口和历史数据。

国家或地区保存稳定代码，由前端翻译；赛区保存 R6 顶层赛区值。出生日期、来源页面、数据版本、更新时间及 Major/SI 赛事 ID 会完整保留并可从管理后台导出。

## 技术栈

- 前端：React 18、Vite、TypeScript、React Router、Zustand、i18next。
- 后端：Node.js、Express、TypeScript、Knex、Zod。
- 数据库：本地 SQLite，生产 PostgreSQL。
- 缓存与实时通信：Redis、Socket.IO。
- 测试：Vitest、Testing Library。

## 部署

生产环境要求 PostgreSQL、Redis、至少 32 字节的随机 `JWT_SECRET`，并应使用独立 `GUEST_ID_SALT`。Docker Compose、迁移、滚动更新和回滚步骤见 [deploy/README.md](deploy/README.md)。

为避免破坏既有会话，Cookie、localStorage、PoW 算法名及 Redis 前缀暂时保留原内部标识。这些名称不影响 SiegeGuess 的 R6 玩法或显示内容。

## 许可

本项目基于 [AGPL-3.0](LICENSE) 开源。
