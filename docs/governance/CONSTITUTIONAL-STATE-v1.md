# Constitutional State Declaration（v1）

> **Bootstrap complete · Enactment pending**

后来者须知：本仓库 **存在** 完整 constitutional framework，但 **authority 尚未 enact**。Pre-enactment 的 bench / dual-run / CI / corpus **≠** binding semantic law。

---

## Semantic constitutional geometry

| Constitutional layer | 当前状态 |
|----------------------|----------|
| Ontology | Drafted（RFC-0001、taxonomy JSON） |
| Constitution | Written（RFC-0001–0004、ADR-O1–O15 草案） |
| Judiciary | Implemented（gates、dual-run — **pre-constitutional**） |
| Evidence system | Operational（foundation + L3 corpus） |
| Promotion law | Defined（RFC-0003） |
| Temporal model | Defined（`ratified_at` 字段 **待填**） |
| Legitimacy model | Defined（TRACEABILITY、ancestry 四问） |
| Ratification | **Pending** |
| Enactment | **Pending** |

**缺的不是结构，而是 enactment event** — [RATIFICATION-CHECKLIST-v1.md](RATIFICATION-CHECKLIST-v1.md)。

---

## Pre-enactment vs post-enactment

| 组件 | Pre-enactment（现在） | Post-enactment（`ratified_at` 之后） |
|------|----------------------|-------------------------------------|
| dual-run | pre-constitutional judiciary | derivative enforcement |
| bench / CI gate | draft enforcement | binding 须 cite ADR/RFC |
| `redraw_only_fallback` | reserved lexicon | legitimacy 须 amendment 路径 |
| GOT / experimental frontend | experimental citizen | promotion → citizenship |
| runtime | capability substrate | constitutional era |
| executable PR | **不得**当作已 ratify | **derivative legitimacy** |

**纪律**：`pre-enactment executable ≠ binding authority`。

---

## `ratified_at` = semantic epoch origin

**Constitutional time begins here.** 之后争议须用 epoch / ADR / promotion lineage 回答，不得用「当时实现如此」「经验上合理」「CI 已 enforce」「模型已经能做」。

| Before enactment | After enactment |
|------------------|-----------------|
| 「当时实现如此」 | cite **semantic epoch** |
| 「经验上合理」 | cite **Accepted ADR** |
| 「效果更好」 | **promotion lineage** |
| 「CI 这样 enforce」 | **derivative legitimacy** |
| 「模型已经能做」 | **constitutional citizenship?** |

---

## Constitutional axioms（anti-semantic-collapse）

| Axiom | 防止 |
|-------|------|
| `semantic ≠ authoritative` | redraw / heuristic 冒充 authority |
| `capability ≠ legitimacy` | 效果更好 → 自动升格 truth |

后续 dispute（redraw、semantic fallback、multimodal ownership、GOT canonical、IR v2）均须回答：是否越 authoritative boundary？是否仅 capability？是否有 ratified lineage？是否处于合法 epoch？

---

## Enactment ceremony（唯一待办）

1. ADR status flip（Accepted / Deferred / Frozen）
2. 写入 `Ontology ratified at`（RFC-0001）
3. Constitution-only PR merge
4. **Semantic epoch begins** → enacted semantic legal order

**顺序（constitutional supremacy）**：ontology → constitution → **ratification** → executable legitimacy → runtime enforcement。

---

## 参考

- [README](README.md) — 索引与 legal order 映射
- [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md)
- [ONTOLOGY-REVIEW-FACILITATOR-v1.md](ONTOLOGY-REVIEW-FACILITATOR-v1.md)
