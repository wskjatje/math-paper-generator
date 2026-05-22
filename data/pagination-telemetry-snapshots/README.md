# Frozen pagination telemetry snapshots (P3.1)

周对比与 release regression **只 diff 此目录 JSON**；禁止用新 compositor 重跑 corpus 覆盖历史 `PageBreakDecisionV1`。

| 路径 | 说明 |
|------|------|
| `<date>/pagination-flow.snapshot.json` | 已提交基线 |
| `ci-current/` | CI 临时（`.gitignore`） |

更新：`npm run pagination-telemetry:snapshot -w @zhixue/web -- --out data/pagination-telemetry-snapshots/<date>`

对比：

```bash
npm run pagination-telemetry:compare -w @zhixue/web --
  --baseline data/pagination-telemetry-snapshots/2026-05-20
  --current data/pagination-telemetry-snapshots/ci-current
  --max-rate-rise 0.03 --max-score-drop 5
```
