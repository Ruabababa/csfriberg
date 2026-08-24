# 固定 81 人数据上线清单

## 首发数据边界

`server/src/db/seeds/players.json` 是首发唯一选手数据源。`pnpm seed` 只导入该固定快照，且可重复执行；其中的来源字段和 URL 仅用于审计，不会在运行时发起外部数据 API 请求。

首次空数据库导入后应有恰好 81 名已启用选手。后续后台人工维护可以变更启用状态或资料，但不应将在线抓取作为发布流程的一部分。

## 本地验证

```bash
pnpm test:local
pnpm build
pnpm check:seed
```

本地开发可以使用 SQLite。生产验证必须使用独立的临时 PostgreSQL 和 Redis，绝不可对现有生产库进行试验性迁移或恢复。

## Preview 上线步骤

1. 在 Vercel Preview 配置生产环境变量，并保持 `MULTIPLAYER_ENABLED=false` 与 `VITE_MULTIPLAYER_ENABLED=false`。
2. 确认目标 Neon PostgreSQL 是空的或已备份；使用该连接串运行 `pnpm migrate`。
3. 使用同一连接串执行 `pnpm seed`，确认输出的固定数据摘要为 81 名选手。
4. 使用只在命令执行时提供的管理员凭据运行 `pnpm create-admin`，完成后从环境中清除该密码。
5. 设置 `NODE_ENV=production`，执行 `pnpm check:production`；它只检查配置、连接、表结构、Redis 和 81 人缓存，不执行迁移或修改数据。
6. 使用 `SMOKE_URL=https://preview.example pnpm smoke` 检查静态页、健康检查和选手列表 API。
7. 执行 `pnpm db:backup`，并使用临时 PostgreSQL 验证一次恢复结果。

## 发布条件

- Preview 已完成迁移、固定种子、管理员初始化、`check:production` 和 smoke 检查。
- PostgreSQL 与 Redis 均为外部生产服务，且 `JWT_SECRET` 与 `GUEST_ID_SALT` 是不同的 32 字节以上随机值。
- `CORS_ORIGINS` 不含 localhost，`TRUST_PROXY=true`，多人开关均为 `false`。
- 已验证的备份存在，并已记录可恢复到临时数据库的步骤。

## 备份与回滚

`pnpm db:backup` 使用 `DB_URL` 调用 `pg_dump`，默认写入 `backups/`。恢复必须显式提供文件、目标 `DB_URL` 与 `CONFIRM_RESTORE=yes`：

```bash
CONFIRM_RESTORE=yes DB_URL='postgresql://target...' pnpm db:restore backups/siegeguess-YYYY-MM-DD.dump
```

恢复会清理目标数据库中的同名对象，因此目标必须是已经确认的临时库或回滚库。导入失败由事务回滚；版本问题回滚 Vercel 部署并保留向后兼容的数据库迁移，不删除带历史对局的选手。
