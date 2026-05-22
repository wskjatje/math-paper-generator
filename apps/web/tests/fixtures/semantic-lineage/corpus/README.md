# Semantic lineage frozen corpus

CI **release contract** 数据源：只读 `exam.snapshot.json`，禁止在 gate 中重跑导入或改写 `import_parse_quality`。

| Case | 用途 |
|------|------|
| `semantic-corpus-bind-refusal-01` | 物化 + bind 遥测齐全（CI Coverage/Quality 双 gate 基线；目录名历史保留） |

bind refusal 回归见 `semanticLineageGate.shared.test.ts`（非 corpus 重算）。

更新 corpus：重新导入真实卷 → 导出 snapshot → 提交；勿用当前 runtime 覆盖历史 JSON。

周对比：写入 `data/telemetry-snapshots/<date>/slo-report.json`，用 `compare-semantic-telemetry-snapshots` diff，禁止重跑旧卷。
