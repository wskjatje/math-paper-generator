# Formal Ontology Review — 议程 v1

**会议性质**：Constitution ratification（非 brainstorming、非 OCR 效果评审）。

**产出**：[`decisions/`](decisions/) 下 ADR-O* 决策记录（Accept / Reject / Defer），**不是**开放式会议纪要。

**前置阅读**（15 min）：[RFC-0001](rfcs/RFC-0001-governance-ontology.md) §2、§5–§8；[taxonomy-semantics.md](taxonomy/taxonomy-semantics.md)；[PR-CLASSIFICATION.md](PR-CLASSIFICATION.md)。

---

## 语义权威层级（会议共识锚点）

```
Constitution
  > Governance executable
    > Runtime behavior
      > Experimental heuristics
```

**唯一审阅句**：*该变化是否有资格改变 truth semantics？*（不是「这个功能好不好」。）

---

## 治理防扩张（已落地，会上仅确认）

| 层 | 机制 | 防止 |
|----|------|------|
| PR classification | [PR-CLASSIFICATION.md](PR-CLASSIFICATION.md) | Runtime 偷渡 Constitution |
| Review freeze | [ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md) | Review 期间 vocabulary 漂移 |
| Executable scope | [EXECUTABLE-GOVERNANCE-SCOPE-v1.md](EXECUTABLE-GOVERNANCE-SCOPE-v1.md) | Executable PR 偷渡 ontology |

---

## 纪律（会上强制执行）

1. 每项议题 **仅** 投：`Accept` | `Reject` | `Defer` — 禁止「再想想」不落态。
2. **`Accept` = future constraint**（不是「听起来合理」）：未来 runtime / executable **必须**受该 ADR 约束；违反即 governance defect，须 Constitution 修订或 Reject 旧 ADR，不得口头豁免。
3. **`Defer` = no legitimacy`**：未解除 Defer 前，不得将相关能力当作已获授权的 truth semantics（含 corpus、gate、promotion）。
4. `Defer` 必须写：**阻塞条件** + **负责跟进 RFC/ADR** + **目标会议/日期**。
5. **禁止** scope diffusion：不讨论 GOT 准确率、不讨论 linker 调参、不现场新增 taxonomy class。
6. **Executable merge 暂停**直至本 review 关闭（见 [ADR-O13](decisions/ADR-O13-executable-merge-gate.md)）。

主持人稿（宣读用）：[ONTOLOGY-REVIEW-FACILITATOR-v1.md](ONTOLOGY-REVIEW-FACILITATOR-v1.md)

---

## 待决清单（按议题）

| ID | 议题 | RFC / 文档 | **建议票** | 决策（会上填） | ADR |
|----|------|------------|------------|----------------|-----|
| O1 | Expected vs detected 分离 | RFC-0001 §2.2 | **Accept** | | [ADR-O1](decisions/ADR-O1-expected-vs-detected.md) |
| O2 | Canonical signal contract | RFC-0001 §2.3 | **Accept** | | [ADR-O2](decisions/ADR-O2-canonical-signal-contract.md) |
| O3 | Topology-preserving 定义 | RFC-0001 §6 | **Accept** | | [ADR-O3](decisions/ADR-O3-topology-preserving.md) |
| O4 | Semantic-preserving 边界 | RFC-0001 §6 | **Defer** | | [ADR-O4](decisions/ADR-O4-semantic-preserving.md) |
| O5 | Mixed-topology 作为 Phase-2 阶跃 | RFC-0001 §7 | **Accept** | | [ADR-O5](decisions/ADR-O5-mixed-topology-phase-boundary.md) |
| O6 | Observational-first（semantic fallback） | RFC-0001 §8.2 | **Accept** | | [ADR-O6](decisions/ADR-O6-observational-first.md) |
| O7 | Suppression = governance semantics | RFC-0001 §8.3 | **Accept** | | [ADR-O7](decisions/ADR-O7-suppression-governance.md) |
| O8 | Redraw ≠ materialize | RFC-0001 §8.1 | **Accept** | | [ADR-O8](decisions/ADR-O8-redraw-not-materialize.md) |
| O9 | Reserved lexicon / maturity ladder | taxonomy-semantics | **Accept** | | [ADR-O9](decisions/ADR-O9-reserved-lexicon.md) |
| O10 | Redraw promotion 路径 | RFC-0001 §8.5 | **Defer** | | [ADR-O10](decisions/ADR-O10-redraw-promotion.md) |
| O11 | Phase-2 落地顺序 §8.6 | RFC-0001 §8.6 | **Accept** | | [ADR-O11](decisions/ADR-O11-phase2-sequence.md) |
| O12 | Foundation set 冻结（5 条） | RFC-0001 §4 | **Accept** | | [ADR-O12](decisions/ADR-O12-foundation-freeze.md) |
| O13 | Executable merge gate | EXECUTABLE-SCOPE | **Accept** | | [ADR-O13](decisions/ADR-O13-executable-merge-gate.md) |
| O14 | Review 期间 taxonomy 新增 | ONTOLOGY-REVIEW freeze | **Freeze** | | [ADR-O14](decisions/ADR-O14-taxonomy-additions-freeze.md) |
| O15 | `redraw_only_fallback` governance legitimacy | RFC-0001 §8.4 | **Defer** | | [ADR-O15](decisions/ADR-O15-redraw-legitimacy.md) |

**建议票**供主持人预读；会上可 Override，须在 ADR 中记录 dissent。

---

## 会议流程（45 min）

| 时间 | 环节 |
|------|------|
| 0–5 | 宣读权威层级 + 审阅句；确认 freeze 纪律 |
| 5–25 | O1–O9、O12–O14：逐条 Accept（预期批量通过） |
| 25–35 | O4、O10、O15：Defer 讨论 — 仅写阻塞条件，不设计实现 |
| 35–40 | O11：确认 Phase-2 顺序 |
| 40–45 | 关闭标准勾选；指定 RFC-0001 → Accepted 的 PR 负责人 |

---

## 关闭标准（全部满足方可结束 review phase）

- [ ] O1–O9、O12–O14 对应 ADR 状态为 **Accepted**（或 Rejected 已记 RFC 修订任务）
- [ ] O4、O10、O15 为 **Deferred** 且阻塞条件已写入 ADR
- [ ] 无人主张 review 前 merge executable governance PR
- [ ] 无人主张 review 前新增 redraw L3 / 扩 `canonical_signal`
- [ ] [ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md) 结论表已回填 ADR 链接

---

## Review 通过后（不在会上执行）

→ 按 [RATIFICATION-CHECKLIST-v1.md](RATIFICATION-CHECKLIST-v1.md) 落态（含 **`Ontology ratified at` 写入 RFC-0001 顶部**）。

1. ADR 终态 + RFC-0001–0004 标 **Accepted** + 同一 `ratified_at` 日期
2. Constitution-only PR merge
3. 开 [EXECUTABLE-GOVERNANCE-SCOPE-v1.md](EXECUTABLE-GOVERNANCE-SCOPE-v1.md) 范围内 PR
4. Phase-2：按 ADR-O11 顺序（O4/O10/O15 仍 Defer）

---

## 参考

- 议题原文：[ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md)
- ADR 索引：[decisions/README.md](decisions/README.md)
