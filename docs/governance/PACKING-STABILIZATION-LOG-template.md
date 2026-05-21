# Packing Stabilization Log（人工纪要模板 · 非 governance freeze）

**性质**：Train 3 **heterogeneous stabilization** 的可审计观察记录；**不**进入 telemetry snapshot、parity compare、runtime 分支或 constitutional truth。

**用法**：复制本模板到 Issue、PR 评论、`docs/stabilization-logs/YYYY-MM/`（若团队维护），或本地笔记。每条记录对应一次目视会话（可含多题/多卷）。

**评审锚点**：[PACKING-STABILIZATION-CHECKLIST.md](./PACKING-STABILIZATION-CHECKLIST.md) · [ECR-RUNTIME-CONSTITUTION-v1.md](./ECR-RUNTIME-CONSTITUTION-v1.md)（四句 invariant）

**明确 non-goals**：

- 不以「更像某份扫描件」作为通过/失败依据  
- 不把本表字段写入 `data-packing-*` scoring 或 CI gate  
- 不用题号/卷名触发 runtime 规则（结构类型笔记即可）

---

## Session meta

| 字段 | 填写 |
|------|------|
| Date | |
| Reviewer | |
| Git SHA（可选） | |
| `?packing_debug=1` | yes / no |
| Viewport profiles 已看 | `desktop_paper` · `mobile_vertical` · `pdf_a4` · `pdf_exam_booklet` · other |

---

## Corpus slice（结构描述 · 禁止题号专规作规则 ID）

| 字段 | 填写 |
|------|------|
| Structure tags（勾选） | `question_with_figure` · `multi-subquestion` · `appendix_only` · `standalone_figure` · `dense-inline` · `multi-figure-transient` |
| 卷/题（**仅观察备注**，非 runtime ID） | 例：导入卷样例 A，大问 II 几何 QWF |
| EPL 路径 | yes / no |

---

## Checklist（topology-preserving）

| # | 项 | pass / fail / n/a | 备注 |
|---|-----|-------------------|------|
| 1 | QWF binding preserved | | |
| 2 | supportive 不主导 vertical cadence | | |
| 3 | appendix 不进主 cadence | | |
| 4 | 无 post-QWF standalone hijack | | |
| 5 | adjacency 无 reorder（组序不变） | | |
| 6 | 跨 viewport 拓扑一致 | | |

---

## Transform interaction（footprint 笔记）

列出在 DevTools 中看到的 **叠加** transform（非单题专规）：

| 位置（结构描述） | `data-packing-transforms` | 风险项（勾选） |
|------------------|----------------------------|----------------|
| 例：QWF 簇内 supportive 图 | `supportive_compaction,adjacency_tightening` | pseudo-regroup · salience inversion · cadence fracture · none |
| | | |
| | | |

**Interaction watchlist 对照**（见 checklist）：supportive×adjacency · transient×inline · supportive×narrow viewport · adjacency×QWF chain

---

## False positives（必查两类）

| 类型 | observed? | 说明 |
|------|-----------|------|
| Pseudo-regroup illusion | yes / no | 视觉像 regroup；`cognitive_layout` 组序是否未变 |
| Salience inversion（stress viewport） | yes / no | supportive 在窄屏/booklet 下是否像主推理图 |

---

## Authority creep 嗅探（一票否决笔记）

若出现以下任一，**停止**视为 stabilization 通过，先修 runtime/纪律而非加 transform：

- [ ] packing 行为改变了 grouping / 组序  
- [ ] `adaptivePresentation` 语义被 packing 修改  
- [ ] debug DOM 被提议纳入 CI score / parity  
- [ ] 以「更像原卷」作为合并理由  

---

## Outcome（本会话结论 · 非 constitutional verdict）

| 结论 | 勾选 |
|------|------|
| Topology-preserving density recovery **stable** | |
| Needs runtime tweak（仅 spatial） | |
| Needs interaction review（叠加风险） | |
| Block Train 4 telemetry freeze | |

**一句话摘要**（必填）：

> 

---

## 相关

- Train 4 前目标：积累本类纪要 → 再考虑 telemetry / ontology freeze  
- 代码：`cognitivePackingRuntime.shared.ts` · `?packing_debug=1`
