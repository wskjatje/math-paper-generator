# Frozen negotiation telemetry snapshots (P3.2)

周对比只 diff JSON；禁止用新 physical adapter 重跑覆盖 `NegotiationDecisionV1` / `rejected_strategies`。

```bash
npm run negotiation-telemetry:snapshot -w @zhixue/web -- --out data/negotiation-telemetry-snapshots/<date>
npm run negotiation-telemetry:compare -w @zhixue/web --
  --baseline data/negotiation-telemetry-snapshots/2026-05-20
  --current data/negotiation-telemetry-snapshots/ci-current
  --max-rate-rise 0.03 --max-score-drop 5
```
