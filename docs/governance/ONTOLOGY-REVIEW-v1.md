# Ontology Semantics Review（v1）

**阶段**：Protocol review — 验证 governance **语言**是否稳定，而非扩展 archetype 或 redraw 能力。

**范围外**：OCR 准确率、renderer 效果、具体 heuristic 调参。

**范围外（暂缓）**：`redraw_only` signal 草案、`redraw_only` L3 corpus、semantic fallback 实现变更。

---

## 背景

- Foundation corpus（5 条）+ RFC-0001–0004 + CI bench/dual-run 已落地。
- RFC-0001 §6–§8 为 **semantic fallback** 建立 constitutional boundary（ontology hardening，非 expansion）。
- Taxonomy 单一权威源：`apps/web/tests/fixtures/import-pipeline/failure-taxonomy.v1.json`（docs 不复制）。

---

## 评审议题

| # | Topic | 问题 | 结论（团队填写） |
|---|--------|------|------------------|
| 1 | **topology-preserving** | 定义是否足够严格？是否覆盖全部 foundation gate？ | |
| 2 | **semantic-preserving** | 是否允许未来 relaxation？何种条件下可讨论？ | |
| 3 | **mixed-topology** | artifact / semantic / runtime 三平面边界是否明确？何时允许共存于同一 specimen？ | |
| 4 | **observational-first** | semantic fallback 默认不得写 authoritative — 是否有例外清单？ | |
| 5 | **suppression semantics** | `shouldSuppressVectorDiagramSchema…` 是否属于 governance ABI 变更？ | |
| 6 | **redraw ≠ materialize** | 是否全员共识：schema 存在 ≠ materialized？ | |
| 7 | **expected vs detected** | 档案身份与 classifier 分离是否可长期维护？ | |
| 8 | **redraw promotion** | 是否需要单独 RFC（强于 RFC-0003 frontend promotion）？ | |
| 9 | **Phase-2 gate** | §8.6 顺序是否同意：先 vocabulary 冻结，再 signal，再 L3？ | |

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
