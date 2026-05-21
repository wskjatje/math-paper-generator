# Cognitive Reading Telemetry v1 (P2.4.5)

与 [SEMANTIC-REPLAY-LINEAGE-v1.md](./SEMANTIC-REPLAY-LINEAGE-v1.md) 同构的 **corpus-level cognitive governance**。

## Planes

| Plane | Truth | Telemetry |
|-------|--------|-----------|
| Semantic | canonical + lineage facts | semantic rates / gates |
| Cognitive | `EducationalCognitiveLayoutV1` | `ReadingFlowDocumentDiagnosticsV1` |
| Presentation | compositor lowering | `presentation_provenance` |

## Invariant（宪法）

1. **`cognitive_layout` 是 reading truth**；`reading_flow_diagnostics` 仅是 interpretation / telemetry。
2. **`replay_mutation: none`** 于 diagnostics 与 corpus snapshot。
3. **Cognitive telemetry never mutates reading truth** — 禁止 diagnostics-driven rewriting of AST / layout / canonical。
4. **Cohort-qualified metrics** — 禁止 `exams_total` 式 false green；见 `readingFlowMetricRegistry.shared.ts` 中 `population`。

## Corpus

- 路径：`apps/web/tests/fixtures/reading-flow/corpus/<caseId>/canonical.txt`
- 派生：`canonical → buildEducationalRenderableDocument → diagnostics`（每次 gate 重放派生，不冻结 diagnostics JSON）

## CLI

```bash
npm run inspect:reading-flow -w @zhixue/web -- --corpus --snapshot
npm run inspect:reading-flow -w @zhixue/web -- --corpus --gate-max-rate document_warn_rate=0.5
npm run inspect:reading-flow -w @zhixue/web -- --corpus --gate-min-score mean_continuity_score=58
npm run inspect:reading-flow -w @zhixue/web -- --list-metrics
```

## Cognitive SLO presets

| Metric | Cohort |
|--------|--------|
| `figure_detachment_rate` | `groups_question_with_figure` |
| `figure_cue_unbound_rate` | `groups_subquestion_with_figure_cue` |
| `mobile_drop_high_rate` | `groups_inline_figure_right_eligible` |
| `attention_jump_rate` | `groups_content_reading` |
| `document_warn_rate` | `documents_with_cognitive_layout` |
| `mean_continuity_score` | corpus rollup（`--gate-min-score`，0–100） |

## Ontology

Namespaced keys：`reading.continuity.mean_score`、`reading.figure.detachment.max_risk` 等，见 `readingFlowFactOntology.shared.ts`。

## P2.4.6 — Temporal snapshots

| 路径 | 说明 |
|------|------|
| `data/cognitive-telemetry-snapshots/<date>/reading-flow.snapshot.json` | 已提交基线 |
| `data/cognitive-telemetry-snapshots/ci-current/` | CI 临时（`.gitignore`） |

```bash
npm run cognitive-telemetry:snapshot -w @zhixue/web -- --out data/cognitive-telemetry-snapshots/2026-05-20 --label baseline
npm run cognitive-telemetry:compare -w @zhixue/web -- \
  --baseline data/cognitive-telemetry-snapshots/2026-05-20 \
  --current data/cognitive-telemetry-snapshots/ci-current
# 或
npm run inspect:reading-flow -w @zhixue/web -- --compare \
  --baseline data/cognitive-telemetry-snapshots/2026-05-20 \
  --current data/cognitive-telemetry-snapshots/ci-current
```

周对比只 diff 冻结 JSON，**禁止**用新 compositor 重跑旧 canonical 再覆盖历史快照。
