# Ontology Ratification — 会后落态清单 v1

**触发**：Formal ontology review 关闭（[ONTOLOGY-REVIEW-AGENDA-v1.md](ONTOLOGY-REVIEW-AGENDA-v1.md) 关闭标准全部勾选）。

**目标**：Constitution **生效时间点**可审计；executable PR 获得 **constitutional authority source**。

---

## 1. ADR 状态（同日完成）

- [ ] `decisions/ADR-O*.md`：`Proposed` → **Accepted** | **Rejected** | **Deferred**
- [ ] 每条 Accepted ADR 填写 `Date`、`Deciders`
- [ ] Deferred（O4、O10、O15）填写 **阻塞条件**（非 redraw 效果讨论）
- [ ] [decisions/README.md](decisions/README.md) 索引表「会上决策」列已同步

---

## 2. Ratification timestamp（宪法生效点）

在 **RFC-0001** 元数据表写入（ISO 8601 日期，会议通过日）：

```markdown
| Ontology ratified at | YYYY-MM-DD |
| Status | **Accepted** — Governance Constitution v1 |
```

同步 bundle（同一 `ratified_at`）：

- [ ] [RFC-0002](rfcs/RFC-0002-projection-stability.md)
- [ ] [RFC-0003](rfcs/RFC-0003-frontend-promotion.md)
- [ ] [RFC-0004](rfcs/RFC-0004-corpus-governance.md)

**语义时间边界**：下列变更若主张改变 truth semantics，须 cite ADR/RFC 且说明相对 `ratified_at` 的关系：

- redraw promotion、GOT canonical candidacy、IR v2、multimodal ownership 扩张、新 taxonomy class legitimacy

---

## 3. Review 文档收口

- [ ] [ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md) 结论列填 ADR 最终态 + 日期
- [ ] [README.md](README.md) 顶部：`protocol review phase` → **ratified YYYY-MM-DD**（链 RFC-0001）
- [ ] RFC-0001 §10 修订记录增加 ratification 行

---

## 4. Constitution PR（仅 docs）

- [ ] 单 PR：`docs/governance/` ADR 落态 + RFC Status + `ratified_at`
- [ ] PR 标题示例：`docs(governance): ratify constitution v1 (YYYY-MM-DD)`
- [ ] **不含** executable corpus / CI / runtime

---

## 5. 解除冻结（顺序）

| 顺序 | 动作 |
|------|------|
| 1 | Constitution PR merged |
| [ ] 2 | 开 Executable governance PR（[EXECUTABLE-GOVERNANCE-SCOPE-v1.md](EXECUTABLE-GOVERNANCE-SCOPE-v1.md)） |
| 3 | Phase-2 按 [ADR-O11](decisions/ADR-O11-phase2-sequence.md)（仍受 O4/O10/O15 Defer 约束） |

---

## 纪律提醒

- **Accept = future constraint** — 会后实现违反 Accepted ADR → CI/gate 应 fail，或走 Constitution 修订，不得「先 merge 再补 RFC」。
- **Defer = no legitimacy** — `ratified_at` **不**自动授予 O4/O10/O15 所涉 legitimacy。
