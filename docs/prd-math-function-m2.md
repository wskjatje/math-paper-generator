# PRD：`math.function` Pack（M2）

> **状态**：M2 已实现（Pack + 闸门 + 标定单测）；微积分图元见 [prd-math-function-m3.md](./prd-math-function-m3.md)（已落地）  


> **关联**：[题图系统总览](./diagram-system.md) · [Pack 注册表](../data/diagram-packs/registry.json)  
> **决策背景**：审计结论——函数/微积分题图目前不能可靠生成；用户要求**禁止硬编码、禁止瞎猜**。M2 落地 `math.function`；微积分切线/积分区显式划入 M3。

---

## 1. 问题与目标

### 1.1 问题

- 题干含「如图」的**函数图像**题，现有路径要么走 `figure_spec` 关键词模板（已禁止作为主路径），要么依赖 AI 直出 SVG（不可校验、易错）。
- 平面几何已有 `math.geometry`（表达式 → 坐标 → 确定性 SVG）；**函数图像缺少同等级的 Spec → 校验 → 渲染闭环**。

### 1.2 M2 目标（一句话）

命题（或导入整理）在 `submit_exam` 中提交 **`pack: "math.function"` 的 `figure_scene`**；服务端用**声明式表达式 + 视窗窗口**在本地**确定性采样**曲线并渲染 SVG；失败则拒绝入库，**不得**用题号/答案分支或关键词模板凑图。

### 1.3 用户价值

- 教师/命题 AI：如图函数题有**可文档化、可校验**的配图字段约定。
- 学生/印刷：曲线与坐标轴、题干所述关键点**可核对**，减少「图与题意不符」。
- 工程：与 `math.geometry` 共用 G1–G4 闸门与 `figureGeneration` 编排，扩展 Pack 而非另起炉灶。

---

## 2. M2 范围

### 2.1 In Scope（M2 必须交付）

| # | 能力 | 说明 |
|---|------|------|
| S1 | **Pack 模块** | `src/lib/diagram/mathFunction.shared.ts`（命名以实现为准）：`parse` / `validate` / `alignWithStem` / `renderSvg` / `tryProcess*` |
| S2 | **Scene 结构 v1** | `axes` + `sampled_curve` + 可选**关键点标注**（见 §4） |
| S3 | **本地采样渲染** | 由 `sampled_curve.expr` + `domain`（或 axes 的 x 范围）在服务端生成折线路径 → SVG；采样参数固定或可配置默认值 |
| S4 | **表达式安全子集** | 白名单运算与函数（见 §4.3）；解析失败 → 校验拒绝，**禁止** `eval` 任意 JS |
| S5 | **闸门 G1–G4** | `figureRequireGate` / 入库前校验：数学如图题若 scene 为 `math.function` 且校验+渲染通过 → 放行 |
| S6 | **命题契约** | `submit_exam` 工具 schema、`SYSTEM_PROMPT`、校验失败提示：`figure_scene.pack` 枚举含 `math.function`；文档与示例 |
| S7 | **figureGeneration 路由** | 按 `pack` 分发至 `tryProcessMathFunctionScene`（与 geometry 并列） |
| S8 | **标定集（最小）** | ≥ **20** 道函数图像标定题（含正例 + 边界/失败例清单），机跑 G2–G4 |
| S9 | **单元测试** | parse / validate / render 快照或几何不变量断言；非法 expr、空 domain、轴域不一致等负例 |
| S10 | **注册表** | `registry.json` 中 `math.function` → `active`，补 `module` 路径 |

### 2.2 场景覆盖（M2 应能稳定支持）

- 一次函数、二次函数、简单有理式（分母零点处断线或分段跳过）。
- 基本初等函数：`sin` / `cos` / `tan`、`exp`、`log`（定义域内）、`sqrt`、`abs`（分段）。
- 单条曲线 + 直角坐标系 + 刻度/网格（major 即可）。
- 题干已给出数值的关键点（截距、顶点、交点坐标）→ `point` 标注并与 stem 对齐检查。

### 2.3 Out of Scope / 非目标（M2 明确不做）

| 非目标 | 归属 / 说明 |
|--------|-------------|
| **切线**（某点处切线、斜率几何意义） | **M3** |
| **定积分 / 曲边梯形阴影**（面积、∫） | **M3** |
| 多条曲线对比、参数方程、极坐标、隐式曲线 | M3+ 或单独立项 |
| 3D 曲面、复平面 | 不在本 Pack |
| 用 `figure_spec.kind` 或题干关键词猜函数类型 | **永久禁止**（与 Diagram Contract 一致） |
| 按题号 / 标准答案 / 卷 ID 硬编码 SVG 或 scene | **永久禁止** |
| AI 直出 SVG 作为函数题主路径 | 仅保留 force/兜底且须标注来源；如图题不得以 AI SVG 绕过 scene |
| 无人审核地自动发明理化生地等 Pack | 见 [diagram-system.md §3](./diagram-system.md) |
| Critic 模型、人工队列产品化、全学科 SLO 90% | 可与 M2 并行筹备，**不阻塞 M2 定义**；M2 验收以 Pack + 标定集为准 |
| 「M2 一次做完所有微积分如图题」 | **不承诺**；微积分专用图元进 M3 |

---

## 3. 验收标准（可测）

以下条目均可通过 **自动化测试 / 脚本 / 固定标定 JSON** 判定，不依赖主观「看起来差不多」。

### 3.1 Pack 行为

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-1 | Scene 解析 | 给定 §4 合法 JSON → `parseMathFunctionScene` 非 null；缺 pack/version/axes/curve → null |
| AC-2 | 表达式校验 | 含未白名单标识符、`Function('...')`、分号、赋值语句 → `validate` 失败且错误信息非空 |
| AC-3 | 确定性渲染 | 同一 scene 两次 `renderSvg` → SVG 字符串一致（或规范化后 hash 一致） |
| AC-4 | 采样可验证 | 标定题中，曲线在 `x=0,1,-1` 等有理点的 **y 与 expr 手算**误差 ≤ `1e-6`（或文档约定 ε） |
| AC-5 | 断点/渐近 | 标定含 `1/x` 类：渲染不产生整图竖线伪影（实现以「domain 内分段」或 skip 策略通过快照测） |
| AC-6 | 轴域一致 | `sampled_curve.domain` 超出 `axes.x` 范围 → validate 失败 |
| AC-7 | 对齐闸门 | 题干写「过点 (2,3)」但 scene 中无对应 point 或坐标偏差超 ε → `alignWithStem` 失败 |
| AC-8 | 闸门 G1 | `contentRequiresFigure` 且 attachments 无合法 scene/URI → `collectFigureRequirementIssues` 非空 |
| AC-9 | 闸门 G2–G3 | 合法 `math.function` scene → `tryProcessMathFunctionScene` 返回 ok + 非空 svg |
| AC-10 | 入库路径 | 命题生成的如图函数题经 `generateFigureAttachmentForQuestion` → `uri` 变为 `/figures/...svg`，且 `figure_scene` 写回 |

### 3.2 命题与 schema

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-11 | `submit_exam` enum | 工具 schema 中 `figure_scene.properties.pack.enum` 含 `"math.function"` |
| AC-12 | 模型提示 | `exam-generation` 系统提示含：函数如图题用 `math.function`，必填 `axes` + `sampled_curve` |
| AC-13 | 拒绝瞎填 pack | 函数题误填 `math.geometry` 且无有效 geometry elements → 渲染/闸门失败（标定负例） |
| AC-14 | 校验文案 | 服务端拒绝保存时，提示指向 `docs/prd-math-function-m2.md` 或 diagram 文档 |

### 3.3 标定集与质量

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-15 | 标定集规模 | 仓库内 ≥ 20 条标定（建议 `examples/v1/diagram-calibration/math-function/*.json` 或等价路径，实现时定） |
| AC-16 | 机判通过率 | 标定集上 G2–G4 **≥ 85%**（M2 门槛；全数学 90% SLO 仍属 geometry+function 合计目标，M3 后复评） |
| AC-17 | 误配率 | 标定集中「错图导致无法解题」人工标注为失败的条目 **≤ 2/20**（M2 初始门槛） |
| AC-18 | 无硬编码 | 代码库 grep：渲染路径无 `questionId` / `order_index` / 答案哈希分支决定 curve expr（CR 检查项） |

### 3.4 文档与注册

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-19 | 注册表 | `data/diagram-packs/registry.json` 中 `math.function.status === "active"` 且 `module` 指向实现文件 |
| AC-20 | 文档 | 本文档 + `diagram-system.md` 里程碑表与 M2/M3 划分一致 |

---

## 4. `figure_scene` 字段约定草案（v1）

### 4.1 顶层

与 `math.geometry` 一致的外壳：

```json
{
  "pack": "math.function",
  "version": 1,
  "viewBox": { "minX": 0, "minY": 0, "width": 420, "height": 320 },
  "elements": []
}
```

- `pack`：固定 `"math.function"`。
- `version`：M2 仅支持 `1`。
- `viewBox`：可选；缺省由渲染器按 axes 推算。
- `elements`：至少含 **1 个 `axes`** + **1 个 `sampled_curve`**。

### 4.2 元素类型

#### 4.2.1 `axes`（直角坐标系）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"axes"` | ✓ | |
| `id` | string | ✓ | 供 curve/point 引用 |
| `x.min` / `x.max` | number | ✓ | 数学横轴范围；须 `min < max` |
| `y.min` / `y.max` | number | ✓ | 数学纵轴范围 |
| `x.label` / `y.label` | string | | 默认 `"x"` / `"y"` |
| `x.tick_step` / `y.tick_step` | number | | 主刻度步长；缺省自动 |
| `grid.major` | boolean | | 默认 `true` |
| `grid.minor` | boolean | | M2 默认 `false` |
| `show_origin` | boolean | | 默认 `true` |

**坐标约定**：`point` 与 `sampled_curve` 使用**数学坐标**（x 向右，y 向上），渲染器负责映射到 SVG（y 轴翻转）。

#### 4.2.2 `sampled_curve`（表达式 + 窗口 → 本地采样）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"sampled_curve"` | ✓ | |
| `id` | string | | 曲线 id |
| `axes` | string | ✓ | 引用 `axes.id` |
| `expr` | string | ✓ | 单变量表达式，变量名见 `variable` |
| `variable` | string | | 默认 `"x"` |
| `domain.min` / `domain.max` | number | ✓ | 采样闭区间；须落在对应 `axes.x` 内 |
| `samples` | number | | 默认 **256**；范围 [64, 512] |
| `style.stroke` | string | | 默认 `"#111"` |
| `style.width` | number | | 默认 `2` |
| `style.dashed` | boolean | | 可选 |
| `label.text` | string | | 曲线标签 |
| `label.at` | `"start"` \| `"end"` \| `"mid"` | | 标签位置 |

**渲染语义**：在 `domain` 上等距取 `samples` 个 x，计算 y = expr(x)；若 y 非有限或超出 `axes.y` 可视策略（实现可选：clip 或 break path），须在 validate 文档化。M2 **不要求** AI 提交采样点数组——采样只发生在服务端。

#### 4.2.3 可选：`point`（关键点标注）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"point"` | ✓ | |
| `id` | string | | |
| `axes` | string | ✓ | |
| `x`, `y` | number | ✓ | 数学坐标 |
| `label` | string | | 如 `"A(1,2)"`；须与题干点名一致 |
| `style` | `"filled"` \| `"hollow"` | | 默认 `filled` |

M2 可选元素：`label`（自由文字，锚于数学坐标）、`segment`（辅助线，**非**切线——切线属 M3）。

### 4.3 表达式白名单（M2）

**允许**：数字、`variable`、括号、`+ - * / ^`、一元 `-`；函数 `sin cos tan exp log sqrt abs`（小写）；常数 `pi e`（解析器内置）。

**禁止**：任意标识符作变量（除 `variable`）、逗号/分号、赋值、调用未白名单函数、字符串、数组、向量化语法。

**验证**：`validate` 阶段必须失败于非法 expr；**禁止**回退到「猜」常见模板（如见 `x^2` 就画抛物线而不看 scene）。

### 4.4 完整示例

```json
{
  "pack": "math.function",
  "version": 1,
  "elements": [
    {
      "type": "axes",
      "id": "ax1",
      "x": { "min": -4, "max": 4, "label": "x", "tick_step": 1 },
      "y": { "min": -2, "max": 6, "label": "y", "tick_step": 1 },
      "grid": { "major": true }
    },
    {
      "type": "sampled_curve",
      "id": "parabola",
      "axes": "ax1",
      "expr": "x^2 - 2*x",
      "variable": "x",
      "domain": { "min": -2, "max": 4 },
      "label": { "text": "y=x²-2x", "at": "end" }
    },
    {
      "type": "point",
      "axes": "ax1",
      "x": 1,
      "y": -1,
      "label": "顶点(1,-1)"
    }
  ]
}
```

### 4.5 与 `attachments[]` 的关系

与 geometry 相同：

```json
{
  "kind": "figure",
  "uri": "pending://figure",
  "alt": "直角坐标系中抛物线 y=x²-2x 及其顶点",
  "figure_scene": { "...": "见上" }
}
```

---

## 5. 与 `submit_exam` 的交互

### 5.1 Pack 枚举扩展

**现状**（`exam-generation.server.ts`）：`figure_scene.pack` 仅 `enum: ["math.geometry"]`。

**M2 变更**：

```json
"pack": { "type": "string", "enum": ["math.geometry", "math.function"] }
```

`figure_scene.description` 增补：`math.function` 须含 `axes` + `sampled_curve`；expr 为白名单表达式；可选 `point` 标注题干关键点。

### 5.2 命题规则（写入 SYSTEM_PROMPT / 校验提示）

| 题干类型 | 必填 pack | 说明 |
|----------|-----------|------|
| 平面几何如图 | `math.geometry` | 现有规则不变 |
| 函数图像如图 | `math.function` | 不得用 geometry 的 segment/polygon 伪造曲线 |
| 微积分如图（切线/面积） | — | M2 **拒绝**或降级为无图 + 人工；M3 再开放专用元素 |

**Pack 选择启发式（给模型，非代码硬编码）**：

- 题干出现「函数图像 / y=f(x) / 抛物线 / 图像交点 / 单调区间」等且图为坐标系曲线 → `math.function`。
- 题干为三角形、圆、网格涂色等 → `math.geometry`。
- 无法判断时：**必须**仍给出一种 scene 且自洽；校验失败则整题拒绝，禁止编造外链 `uri`。

### 5.3 服务端处理顺序（与现有流水线一致）

```
submit_exam → 解析 attachments.figure_scene
           → pack === math.function ? tryProcessMathFunctionScene
           → pack === math.geometry ? tryProcessMathGeometryScene
           → 失败 → 拒绝保存 / figure 生成失败原因写回
           → 成功 → 写 SVG + 更新 uri
```

### 5.4 `figureRequireGate` 扩展

- 数学如图题：存在 **任一** 合法且可渲染的 `math.geometry` **或** `math.function` scene → G1 通过。
- 失败文案由「仅 math.geometry」改为「math.geometry 或 math.function」。

### 5.5 AI 补 scene（可选路径）

`figureSvgAi.server.ts` 可扩展第二张 prompt 模板：输出 `math.function` JSON；**仍必须**过本地 validate + render，与 geometry 同级，不得跳过。

---

## 6. 风险与依赖

### 6.1 依赖

| 依赖 | 说明 | 阻塞？ |
|------|------|--------|
| `math.geometry` Pack 模式 | parse/validate/render/tryProcess 结构与测试惯例 | 否（可并行，建议复用） |
| 安全表达式引擎 | 如 `mathjs` 受限 scope 或自研递归下降 | **是**（M2 核心） |
| `figureGeneration.server.ts` | 按 pack 分发 | 是 |
| `figureRequireGate.shared.ts` | 多 pack 放行 | 是 |
| `exam-generation.server.ts` | schema + prompt | 是 |
| 标定集维护流程 | 与 geometry 标定同仓库约定 | 否（可与实现同步） |
| `registry.json` | status/module | 否 |

### 6.2 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| **模型 expr 与题干不一致** | 图错导致无法解题 | G4 对齐：题干数值点/截距/顶点与 `point`/expr 交叉验证；失败拒绝 |
| **表达式注入** | 安全 | 白名单 parse-only，禁 `eval`；安全 review 必过 |
| **采样/断点视觉伪影** | 误配 | 标定含 `1/x`、`|x|`；快照测试 + M2 不承诺完美渐近线 |
| **窗口与题干不一致** | 关键点在图外 | validate domain ⊆ axes；对齐检查题干是否声明范围 |
| **geometry / function pack 混用** | 闸门误放 | schema 分离；负例测试；prompt 明确分流 |
| **M2 范围膨胀** | 延期 | 切线/积分区严格标 M3；本 PRD 非目标表作 CR 依据 |
| **标定 85% 未达标** | 不启用批量命题 | 未达标前函数如图题可人工补 scene 或关闭该题型批量生成 |

### 6.3 M3 预告（非 M2 承诺）

- 元素：`tangent`（切线）、`integral_region`（x 区间阴影）。
- 对齐：题干「在 x=a 处切线斜率为 k」「阴影部分面积」与 scene 数值一致。
- 单独 PRD 与标定集扩展。

---

## 7. 里程碑对齐（与 diagram-system.md）

| 代号 | 内容 | 状态 |
|------|------|------|
| M0 | 契约、注册表、如图闸门、文档 | 进行中 |
| M1 | `math.geometry` scene + 渲染 + 对齐 | 进行中 |
| **M2** | **`math.function` Pack（本文档）** | **待开发** |
| **M3** | 微积分图元（切线、积分区）+ function 标定扩容 | 已落地（见 prd-math-function-m3） |
| M4+ | Critic、人工队列、全数学 SLO；其他学科 Pack | 数学合计达标后 |

---

## 8. 评审检查清单（PO 签字用）

- [ ] 非目标含切线/积分区，且明确不承诺 M2 一次做完微积分
- [ ] 验收条目 AC-1–AC-20 均可自动化或标定脚本判定
- [ ] `figure_scene` 草案无「模型提交采样点数组」主路径
- [ ] `submit_exam` pack 枚举扩展已排进实现任务
- [ ] 无「无人审核全自动多学科」表述

---

*文档版本：2026-07-18 · 作者：产品经理（Agent）*
