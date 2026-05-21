# Ontology Semantics Review（v1）

**阶段**：Formal ontology review — 验证 governance **语言**是否稳定，而非扩展 archetype 或 redraw 能力。

**会议议程（待决清单 + ADR）**：[ONTOLOGY-REVIEW-AGENDA-v1.md](ONTOLOGY-REVIEW-AGENDA-v1.md) → [decisions/](decisions/)（Accept / Reject / Defer，非开放式纪要）。

**范围外**：OCR 准确率、renderer 效果、具体 heuristic 调参。

**范围外（暂缓）**：`redraw_only` signal 草案、`redraw_only` L3 corpus、semantic fallback 实现变更。

## Review 期间冻结（允许 vs 禁止）

| 允许 | 禁止 |
|------|------|
| RFC / README / review 文档措辞澄清 | 新增 foundation archetype 或 corpus case |
| `case.meta` / `notes.md` 说明性编辑 | 修改 `severity` 语义或扩展 `canonical_signal` 词汇表 |
| 记录团队结论于本文件 | 向 `failure-taxonomy.v1.json` **新增** class（含扩展现有 redraw 类信号） |
| | redraw L3、semantic confidence、topology score 等新名词 |
| | 在同一 PR 混合 Constitution + Executable + Runtime |

**Foundation set 冻结**（5 条，见 README）：`materialized-bind-01`、`placeholder-token-01`、`degraded-global-01`、`parent-question-double-figure`、`ocr-no-crop`。

---

## 背景

- Foundation corpus（5 条）+ RFC-0001–0004 + CI bench/dual-run 已落地。
- RFC-0001 §6–§8 为 **semantic fallback** 建立 constitutional boundary（ontology hardening，非 expansion）。
- Taxonomy 单一权威源：`apps/web/tests/fixtures/import-pipeline/failure-taxonomy.v1.json`（docs 不复制）。

---

## 评审议题

| # | Topic | ADR | 建议票 | 结论（会上填） |
|---|--------|-----|--------|----------------|
| 1 | **topology-preserving** | [ADR-O3](decisions/ADR-O3-topology-preserving.md) | Accept | |
| 2 | **semantic-preserving** | [ADR-O4](decisions/ADR-O4-semantic-preserving.md) | Defer | |
| 3 | **mixed-topology** | [ADR-O5](decisions/ADR-O5-mixed-topology-phase-boundary.md) | Accept | |
| 4 | **observational-first** | [ADR-O6](decisions/ADR-O6-observational-first.md) | Accept | |
| 5 | **suppression semantics** | [ADR-O7](decisions/ADR-O7-suppression-governance.md) | Accept | |
| 6 | **redraw ≠ materialize** | [ADR-O8](decisions/ADR-O8-redraw-not-materialize.md) | Accept | |
| 7 | **expected vs detected** | [ADR-O1](decisions/ADR-O1-expected-vs-detected.md) | Accept | |
| 8 | **redraw promotion** | [ADR-O10](decisions/ADR-O10-redraw-promotion.md) | Defer | |
| 9 | **Phase-2 gate** | [ADR-O11](decisions/ADR-O11-phase2-sequence.md) | Accept | |
| 10 | **Reserved lexicon** | [ADR-O9](decisions/ADR-O9-reserved-lexicon.md) / [O15](decisions/ADR-O15-redraw-legitimacy.md) | Accept / Defer legitimacy | |

### 议题 #10 说明：`redraw_only_fallback`

`failure-taxonomy.v1.json` 中 **已存在** 类定义，但 **尚无**：

- corpus specimen
- L3 / foundation gate 叙事
- Phase-2 canonical_signal 扩展
- promotion path

即：**vocabulary exists, governance legitimacy does not yet exist**（见 [taxonomy-semantics.md](taxonomy/taxonomy-semantics.md)）。

Review 目标：mixed-topology **可组合、可审阅、长期不塌缩** — 非「redraw 启发式是否聪明」。

---

## 通过标准（建议）

- [ ] 术语表无重大异议（或异议已记入 RFC 修订记录）。
- [ ] 无人主张「在 review 前」新增 redraw corpus / redraw signals。
- [ ] mixed-topology 被理解为 **复杂度阶跃**，非普通新 class。
- [ ] 确认：**semantic ≠ authoritative** 为团队共同语言。

---

## 通过后下一步（不在本次 review 执行）

1. 将 RFC-0001 标为 **Accepted**（或 v1.0）。
2. 可选：起草 `redraw_only` `expected_canonical_signals`（仍无 L3）。
3. 首条 `redraw_only` L3（第一条 semantic governance specimen）。

---

## 参考

- [RFC-0001 §6–§8](rfcs/RFC-0001-governance-ontology.md)
- [RFC-0003 Frontend Promotion](rfcs/RFC-0003-frontend-promotion.md)
- `npm run import-pipeline:taxonomy-coverage -w @zhixue/web`
