# Constitutional Traceability（v1）

**语义**：`Ontology ratified at` 不是装饰性元数据，而是 **semantic legality begins here** — constitution 对 truth semantics 具有约束力的起点。

**时间线**：

```
pre-ratification  ≠  post-ratification
```

| 阶段 | 约束力 |
|------|--------|
| **Pre-ratification** | RFC/ADR 为草案；implementation history、会前讨论、runtime 行为 **均不** 构成 binding semantics |
| **Post-ratification** | 仅 **Accepted** ADR + **Accepted** RFC 为 binding；authority 扩张须显式 cite 谱系 |

**纪律**（RFC-0001 元数据）：

- **不得**援引「会前共识」「实现早就存在」「当时 review 提过」作为 legitimacy。
- **Only ratified semantics are binding** — informal consensus leakage 无效。
- `ratified_at` **之后** 的 truth semantics 变更须 ADR/RFC 修订；**之前** 的历史行为不构成 tacit approval。

---

## 四层权威（闭合）

| 层 | 原则 |
|----|------|
| Capability | 能产生语义；**≠** authoritative |
| Governance | **唯一**有权扩展 truth semantics（ontology sovereignty） |
| Executable | faithful enforcement；**governance non-creativity** — 不得 reinterpret semantics |
| Runtime | 遵守 Accepted ADR；违反 → Constitution 修订 |

**Executable authority is derivative** — 来自 ratified constitution，非「代码已跑通」。

**Enactment 顺序**：ADR 落态 → `ratified_at` → Constitution-only PR → Executable PR（见 [RATIFICATION-CHECKLIST-v1.md](RATIFICATION-CHECKLIST-v1.md)）。

---

## Authority 扩张四问（post-ratification 必答）

任何主张改变 truth semantics 的变更（含 redraw promotion、GOT canonicalization、multimodal ownership、IR v2、topology 扩展、新 taxonomy legitimacy）须书面回答：

| # | 问题 |
|---|------|
| 1 | 基于哪条 **Accepted** ADR / RFC？（cite ID + 章节） |
| 2 | 发生在 `ratified_at` **之前**还是**之后**？（之后须新/修订 ADR 或 RFC） |
| 3 | 是否走 **promotion path**？（如 RFC-0003、ADR-O10 解除 Defer 后） |
| 4 | 是否 **修改 ontology**？（改 taxonomy / signal / severity → Constitution PR，非 Runtime 夹带） |

无法四问齐备 → **无 constitutional ancestry** → 不得 merge 为 governance-legitimate 行为。

---

## 与 Defer 的关系

| ADR 状态 | 含义 |
|----------|------|
| **Accepted** | Future constraint；CI/gate 可 enforce |
| **Deferred** | **No legitimacy** — capability 可实验，不得当 authoritative |
| **Frozen** | Review 窗口内禁止扩张（ADR-O14） |

`ratified_at` **不**自动解除 O4 / O10 / O15 的 Defer。

---

## 制度词汇（constitutional continuity）

| 术语 | 含义 |
|------|------|
| **Constitutional continuity** | 未来 semantic authority 须可追溯到某次正式 **enactment**（ADR + `ratified_at`），非工程默契 |
| **Semantic epoch** | 以 `ratified_at` 为界的 **semantic epoch boundary**；变更须声明属于哪一 epoch |
| **Enacted constitutional era** | Constitution-only PR merge 之后；runtime legitimacy 仅在此 timeline 内获得 |
| **Semantic chain of custody** | 从 capability 实验 → comparative review → promotion → ratification 的可审计谱系 |
| **Semantic citizenship** | existence ≠ legitimacy；须完成 promotion + ratification 方获 constitutional citizenship |
| **Semantic ancestry** | 四问齐备的 cite 链；不齐 → 实现存在但 **无合法 authority** |
| **Semantic rule of law** | evolution 纳入法治时间线；**runtime drift 不得 retroactively redefine ontology** |

**Retroactivity 纪律**：禁止「这个 signal 当年其实不是这个意思」「taxonomy 以前这样定义但 runtime 后来变了」式 **semantic retroactive reinterpretation**。历史实现、历史 CI 行为若无 ratified 谱系，不构成 grandfathering 或 tacit approval。

**Tooling cannot silently legislate**：bench / corpus / projection / gate 仅 **faithful enforce**；不得反向定义或重写 ontology（与 PR 分类、executable scope、non-creativity Doctrine 同构）。

---

## 参考

- [RFC-0001 §0](rfcs/RFC-0001-governance-ontology.md) — 四层权威、semantic time boundary
- [decisions/](decisions/) — ADR-O1–O15
- [PR-CLASSIFICATION.md](PR-CLASSIFICATION.md) — Constitution / Executable / Runtime 分离
