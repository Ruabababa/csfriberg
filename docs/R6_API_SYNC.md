# R6 官方 API 数据同步

## 边界

正式数据源为 Liquipedia 官方数据 API。应用运行期间不请求 Liquipedia，不实现 HTML 爬虫，API 凭据只从本地环境变量读取且不得写入仓库或快照。

当前 `api` 传输适配器尚未启用：

```bash
pnpm r6:sync --source api
```

会返回 `LIQUIPEDIA_API_NOT_CONFIGURED`。API 获批后只在传输层把官方响应转换成下述快照结构，后续标准化、校验、审核和导入不再改变。

## 快照契约

```json
{
  "provider": "liquipedia",
  "dataVersion": "official-version-or-response-timestamp",
  "generatedAt": "2026-08-04T00:00:00.000Z",
  "fullSync": true,
  "players": [
    {
      "sourceId": "stable-official-player-id",
      "nickname": "Player",
      "nationality": "FR",
      "region": "Europe",
      "team": "Team",
      "birthDate": "2000-01-01",
      "roles": ["Entry", "Flex"],
      "status": "active",
      "sourceUrl": "https://liquipedia.net/rainbowsix/Player",
      "sourceUpdatedAt": "2026-08-04T00:00:00.000Z",
      "majorSiEventIds": ["major-event-id"],
      "majorSiChampionshipEventIds": []
    }
  ]
}
```

`fullSync=true` 表示快照覆盖全部官方合格选手；只有这种快照会自动停用消失的官方选手及首次导入时的旧无来源选手。补丁或抽样快照必须设为 `false`。

## Dry-run

```bash
pnpm r6:sync --source snapshot --snapshot path/to/snapshot.json
```

该命令不修改数据库，只在 `server/data/r6-sync/<timestamp>/` 生成：

- `snapshot.json`
- `normalized.json`
- `review.json`
- `summary.json`

单条格式错误不会中断整个快照，而会以 `disposition: rejected` 写入审核文件。未知位置、未知赛区、身份不明确、重复赛事或统计冲突以 `disposition: review` 写入。两类记录都不会进入游戏池。

## Apply

只有 `review.json` 为空时才允许执行：

```bash
pnpm r6:sync --source snapshot --snapshot path/to/snapshot.json --apply
```

写入在单个数据库事务中完成。任何选手或难度成员关系写入失败都会回滚整次导入。选手按 `source_provider + source_player_id` upsert，昵称变化不会创建新行，重名昵称也不会冲突。

`summary.json` 包含 `accepted`、`reviewed`、`rejected`、`created`、`updated`、`disabled` 和 `applied`。dry-run 的数据库变更数量为 `null`。
如果 `--apply` 因存在待审核记录而被拒绝，或后续数据库事务失败，目录中仍会保留
`applied: false` 的完整摘要，便于定位和审计本次同步。

## 数据规则

- 去重后 `Major + SI` 出场数必须大于 0。
- 冠军赛事 ID 必须是参赛赛事 ID 的子集。
- 冠军数不得大于出场数。
- 出生日期用于按快照时间计算年龄。
- 位置必须能归一化到项目的 R6 位置集合。
- 国家或地区使用两位稳定代码。
- 赛区必须能归一化到版本控制的 R6 顶层赛区集合。
- `normal` 包含全部合格选手，`beginner` 包含全部冠军，`easy` 包含全部冠军及知名名单。

完整口径见 [R6_DATA_POLICY.md](./R6_DATA_POLICY.md)。
