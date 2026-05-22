# 几何示意图：规则推断与相关修复（入库说明）

本文档将 **题干 → 矢量示意图** 的规则链、**正方形链** 与 **旋转三角形** 的约束、以及 **OCR/语义修复** 的入口 **固化为仓库事实来源**，供实现、联调与回归对照。实现代码以 `apps/web/src/lib/geometry/*.shared.ts` 与 `geometryDiagramInference.server.ts` 为准；本文仅作归纳与验收口径。

---

## 0. 题干预处理（重要）

- `stripStemNoiseForGeometry` **保留** `$...$`、`\(...\)` 内的可读片段（去掉反斜杠），并把 `\triangle` 规范为 **△**，避免 `$\triangle ABC$` 被整块删掉后 **尺规复制角 / 三角形解析** 恒失败而落到 LLM。
- 顶点撇号（`A'`、`A′`）在 `parseTriangleVertices` 中与 **△A'B'C'** 一并归一成 **A、B、C**（供旋转绕 **B** 等规则命中）。

## 1. 总流程（`inferGeometryDiagramFromStem`）

| 阶段 | 行为 |
|------|------|
| 规则 | `tryRuleBasedDiagramSchema(stem)` 按 **固定顺序** 尝试（见第 2 节），命中则返回 `diagram_schema` |
| 回退 | `mode: "full"` 时调 LLM 输出 `GeometryDiagramSchemaV1`；`"rule_only"` 不调模型（线下导入等） |
| 落库 | 题目 `questions[].diagram_schema`；**已入库记录不会随代码自动更新**，需重导或重跑推断 |

入口文件：

- `apps/web/src/lib/geometryDiagramInference.server.ts` — 推断与批量填充
- `apps/web/src/lib/geometry/geometryRuleInference.shared.ts` — 规则链编排

---

## 2. 规则链顺序（必须保持）

1. **尺规复制角**（`angle_copy_constraints_v1` / `v2`）  
   - 命中：`stemLooksLikeAngleCopyConstruction` + `parseTriangleVertices` + 弧/圆心等  
   - 实现：`geometryAngleCopyLayout.shared.ts`、`geometryStemRuleParse.shared.ts`

2. **绕点旋转 + 落边**（`rotation_triangle_constraints_v1`）  
   - 命中：△ABC、**绕点 B** 旋转、**C′ 落在边 AC** 等（见 `geometryRotationTriangle.shared.ts` 中 `stemLooksLikeRotationTriangleProblem`）  
   - 约束：程序搜索旋转角，使 **C 绕 B 旋转后落在闭线段 AC 上**；必须包含 **边 AC** 等线段

3. **正方形链 + 截线 EF + 矩形 PMDN**（`square_chain_constraints_v1`）  
   - 命中：`stemLooksLikeSquareChainProblem` + `trySquareChainDiagramSchema`  
   - 实现：`geometrySquareChain.shared.ts`、约束快照 `geometryConstraintDSL.shared.ts`（`meta.constraint_dsl`）

4. 若均失败且允许模型，走 **LLM 坐标**（`meta.layout_engine` 多为空或随模型约定）

---

## 3. 正方形链（`square_chain_constraints_v1`）

### 3.1 顶点与画布

- 逻辑画布 `0–100`，**y 向下**；槽位 **G0..G3 = BL → BR → TR → TL**（逆时针对画布边界）。
- 题干「**正方形ABCD**」解析为四字环 `square_cycle`；**顺/逆时针**由 `parseSquareWinding`（**顺时针** / **逆时针**；未写则默认 **ccw**）。

### 3.2 槽位旋转（与扫描卷对齐）

- `inferSquareSlotRotation(stem)` 在以下情况对四字环整体 **+1 槽**（使常见卷面 **A 右下、D 左下** 等）：
  - 出现 **五边形 AEFCD** 或 **截去…角**
  - 或同时有 **矩形** 且正文出现 **CD 与 AD** 的联合表述（如 **分别在边 CD，AD 上**）
- 显式 **左下为 A** 类描述时保持 **0 旋转**。
- 映射函数：`mapSquareCycleToCorners(letters, winding, slotRotation)`。

### 3.3 点 E、F、P

- 边上点：「**点 E 在边 AB 上**」「**E、F 分别在边 AB 和 BC 上**」等；**E / F 点名** 优先于纯几何「底/右」启发式。
- **数值**：`parseSquareChainNumericHints` — **边长**、**BE / AE**、**tan∠BFE**；在 **∠BFE 为 B 处直角** 时用 **BF = BE / tan∠BFE** 定 F；**比例优先于** 文内误匹配（如 `tan∠BFE=1/2` 勿判成 `FE=1`）。

### 3.4 矩形 PMDN

- 第三字为与正方形 **共用的顶点**（多为 **D**）；**M ∈ CD、N ∈ AD** 时，以 **D 为锚**，将动点 **P 投影到线段 DA、DC** 得 **N、M**，第四顶点 **N + M − D**（与正方形边轴对齐）。

### 3.5 元数据

- `meta.layout_engine = "square_chain_constraints_v1"`
- `meta.layout_template_id`：`square_abcd_ef_rect_pmdn_v1` 或带 `_r1` 等旋转后缀
- 可选 `meta.constraint_dsl`：`SquareChainConstraintV1Schema` 可解析快照

---

## 4. 旋转三角形（`rotation_triangle_constraints_v1`）

- 等腰底边 + 顶角可解析（默认 36°）；**C 绕 B 旋转** 后落在 **AC** 上；输出 **A、B、C、A′、C′（实现中 id 可能为 Ap、Cp）** 及 **AC、BC′、A′C′** 等。
- 详见：`geometryRotationTriangle.shared.ts`。

---

## 5. 渲染侧标签

- `GeometryDiagramRenderer.tsx` 按 `layout_engine` 区分标题：正方形链、旋转三角形、角复制、默认「结构化重绘」。

---

## 6. OCR / 题干语义修复（与「绘图规则」并列入库）

以下能力与几何规则独立，但同属「离线试卷 → 可用题干」链路：

| 能力 | 说明 | 代码 / 文档 |
|------|------|-------------|
| 可插拔 OCR 管道 | 网关全量 JSON → `runPluggableOcrPipeline` | `docs/architecture/ocr-pluggable.md` |
| 教育符号 / 规则词典 | 规则纠错 | `apps/web/src/lib/ocr/educationSymbolLexicon.ts` |
| 可选 AI 语义修复 | 线下导入「入库前 AI 语义修复」 | `ocr-ai-repair.server.ts`、`repairOfflineOcrTextWithAi`；模型键 `localSubjectModels.ocr_repair` |
| 阶段 C 卷面 / 图区 | 题号↔图、示意图块、启发式 | `docs/architecture/ocr-exam-sheet-remediation-plan.md` |

---

## 7. 回归与验证

- 单元测试：`apps/web/src/lib/geometry/*.test.ts`（`npm run test -w @zhixue/web`）
- 改规则后执行构建：`npm run build -w @zhixue/web`
- 改 JSON 卷面数据仍按仓库约定执行 `make validate`（若涉及 `schemas/v1`）

---

## 8. 变更记录

- 新增或调整规则时，**同时更新** 本文件与对应 `*.shared.ts` 内注释，避免「口头规则」与代码分叉。
