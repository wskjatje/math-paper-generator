# Frozen semantic telemetry snapshots

周对比与 CI regression **只 diff 此目录下的 JSON**，禁止用新 runtime 重跑旧卷 `import_parse_quality`。

| 路径 | 说明 |
|------|------|
| `<date>/slo-report.json` | 已提交基线（`semantic-telemetry:snapshot` 产出） |
| `ci-current/` | CI / 本地临时目录（`.gitignore`） |

更新基线：re-import 扩充 corpus → `npm run semantic-telemetry:snapshot -w @zhixue/web -- --out data/telemetry-snapshots/<date>` → 提交。
