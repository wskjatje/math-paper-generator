# Ontology Review — 主持人稿 v1（宣读用）

**时长**：≤45 min · **性质**：Constitutional ratification，非 brainstorming。

**会前**：ADR-O1–O15 已发；与会者读过 RFC-0001 §2、§5–§8。

---

## 0:00 — 开场（2 min）

> 本场只回答一个问题：**该变化是否有资格改变 truth semantics？**
>
> 我们不评：OCR 准不准、图画得好不好、启发式聪不聪明。
>
> 产出是 ADR 状态（Accept / Reject / Defer），不是会议纪要。
>
> **Accept = future constraint**：不是「挺合理」，而是「以后 runtime 必须守，破了要修 Constitution，不能口头放过」。
>
> **Defer = no legitimacy**：没解除 Defer，就不能当 governance 已批准（尤其 redraw / semantic plane）。

---

## 0:02 — 权威层级（1 min）

> Constitution > Executable governance > Runtime > Experimental。
>
> 改 semantics 的权限只在 Constitution stream。Executable merge **暂停**（ADR-O13），直到今天关会。

---

## 0:03 — 防扩张（1 min）

> 三层已就位：PR 分类、review freeze、executable scope。
>
> 会上 **禁止**：新 taxonomy class、扩 canonical_signal、讨论 GOT/redraw 实现、现场改 foundation corpus。

---

## 0:05 — 批量 Accept：boundary preservation（18 min）

> 下面每条只问：**是否接受为未来约束？** 有异议说编号，否则记 Accept。

| 宣读 | ADR |
|------|-----|
| 标本身份 = expected；classifier = detected，不得混用 | O1 |
| canonical_signal = 机器不变量合同 | O2 |
| topology-preserving = 可追踪 artifact 谱系 | O3 |
| mixed-topology = Phase-2 阶跃，非普通新 class | O5 |
| semantic fallback 默认 observational-first，无默认例外 | O6 |
| suppression 变更 = ontology 变更 | O7 |
| schema 存在 ≠ materialized | O8 |
| reserved lexicon：词在 ≠ legitimacy 在 | O9 |
| Phase-2 顺序：review → signal 草案 → L3 → promotion | O11 |
| foundation 五条冻结为 calibration core | O12 |
| executable merge 待 review 关闭 | O13 |
| review 期间 taxonomy 新增 **Frozen** | O14 |

**若无异议**：以上 ADR 标 **Accepted**，记入 `Date` / `Deciders`。

---

## 0:23 — Defer only：legitimacy expansion（10 min）

> 这三条是 **semantic authority expansion**，今天 **不** 给 legitimacy，只写阻塞条件。

| 宣读 | ADR | 动作 |
|------|-----|------|
| semantic-preserving **量化标准** 未定 | O4 | Defer + 填阻塞条件 |
| redraw **promotion** 路径未定 | O10 | Defer |
| `redraw_only_fallback` **governance legitimacy** 未定 | O15 | Defer |

> 澄清：runtime 可继续实验 redraw；**不得**用「能跑」暗示已 ratify。

**禁止在本段**：争论 redraw 效果、是否该默认 authoritative。

---

## 0:33 — 关闭检查（5 min）

- [ ] O1–O3、O5–O9、O11–O14 → **Accepted**（或少数 **Rejected** + 跟进任务）
- [ ] O4、O10、O15 → **Deferred** + 阻塞条件已写
- [ ] 无人主张会前 merge executable / 新增 redraw L3
- [ ] 指定：RFC-0001 → Accepted 的 PR owner + 日期

---

## 0:38 — 会后一句（1 min）

> Review 关闭后顺序：**Constitution Accepted → Executable PR（faithful companion）→ Phase-2 按 ADR-O11**。
>
> 散会。细节争论去 ADR 修订 PR，不拉长本场。

---

## 主持人拦截话术（scope diffusion 时用）

| 若出现… | 说 |
|---------|-----|
| 「GOT 能不能当 canonical」 | 「Frontend promotion 是 RFC-0003 + 另会；今天只 ratify boundary。」 |
| 「redraw 效果已经很好」 | 「Capability ≠ legitimacy。O15 Defer。」 |
| 「先 merge bench 再说」 | 「ADR-O13：executable 等 ratification。」 |
| 「加个 taxonomy 类很快」 | 「O14 Frozen。要加类走 Constitution PR。」 |
| 「Accept 就是大家都同意吧」 | 「Accept = future constraint。你愿让 CI 因违反它而 fail 吗？」 |

---

## 参考

- 待决表：[ONTOLOGY-REVIEW-AGENDA-v1.md](ONTOLOGY-REVIEW-AGENDA-v1.md)
- ADR 索引：[decisions/README.md](decisions/README.md)
