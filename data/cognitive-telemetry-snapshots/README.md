# Frozen cognitive telemetry snapshots (P2.4.6)

周对比与 release regression **只 diff 此目录下的 JSON**，禁止用新 compositor 重跑旧 corpus canonical 覆盖历史快照。

| 路径 | 说明 |
|------|------|
| `<date>/reading-flow.snapshot.json` | 已提交基线（`cognitive-telemetry:snapshot` 产出） |
| `ci-current/` | CI / 本地临时（`.gitignore`） |

更新基线：扩充 `apps/web/tests/fixtures/reading-flow/corpus` →  
`npm run cognitive-telemetry:snapshot -w @zhixue/web -- --out data/cognitive-telemetry-snapshots/<date>` → 提交。

对比：`npm run cognitive-telemetry:compare -w @zhixue/web -- --baseline <date> --current ci-current`
