# R6 本地验证与上线清单

## 当前本地阶段

```bash
pnpm test:local
pnpm --filter server build
pnpm --filter client build
pnpm r6:sync --source snapshot --snapshot server/src/r6Sync/fixtures/snapshot.json
```

不要在现有本地 SQLite 上直接试验首次正式导入。先给 `DB_URL` 指向临时 SQLite 文件，再执行 `--apply`，确认迁移、停用和历史保留行为。

本阶段不运行 Redis、PostgreSQL、Socket.IO 房间、观战、断线恢复、跨实例广播或负载测试。

## 数据库验收

1. 从旧结构迁移后存在 `source_provider`、`source_player_id`、`roles`、`birth_date`、来源元数据和赛事 ID 字段。
2. 昵称唯一约束已移除，来源身份组合保持唯一。
3. 旧 Major 字段回填到 `major_si_*`，新导入同时镜像旧字段。
4. 完整同步停用旧无来源选手，但不删除其历史对局。
5. 部分同步不自动停用未出现的选手。
6. 昵称改变仍更新同一来源 ID；不同来源 ID 可以使用相同昵称。
7. 任一写入失败时整批事务回滚。
8. 三个难度池符合数据政策。

## API 获批后的步骤

1. 保存脱敏后的真实官方响应 fixture。
2. 实现 Liquipedia 传输适配器并转换到既有快照契约。
3. 运行 dry-run，处理所有审核与拒绝记录。
4. 在临时或 staging 数据库执行 `--apply`。
5. 验证搜索、重名自动补全、答案弹窗、回放和九项反馈。
6. 备份正式数据库后执行完整同步。
7. 最后进行 Redis、PostgreSQL、Socket.IO 和多实例在线联调。

## 回滚

- 导入失败：事务会自动回滚。
- 导入内容错误：恢复数据库备份，或将相关选手设为 `is_enabled=false`；不要删除有历史对局的选手。
- 应用版本错误：回滚应用镜像，保留向后兼容的数据库迁移。
