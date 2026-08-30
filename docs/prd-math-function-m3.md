# PRD：`math.function` Pack 微积分扩展（M3）

> **状态**：已落地（M2 已落地；本文档为 M3 范围与验收依据）  
> **关联**：[题图系统总览](./diagram-system.md) · [M2 PRD](./prd-math-function-m2.md) · [Pack 注册表](../data/diagram-packs/registry.json)  
> **决策背景**：M2 已交付 `axes` + `sampled_curve` 本地采样；题干含**切线**或**定积分阴影**的如图题在 M2 被 prompt 明确禁止。M3 在同一 Pack（`math.function`，非新 pack）上扩展图元，并强化 G4 数值对齐；**仍禁止硬编码、禁止瞎猜**。

---

## 1. 问题与目标

### 1.1 问题

- 高中/竞赛微积分如图题常见两类配图依赖：**点 x=a 处切线**（含斜率 k、切点坐标）、**x 区间上曲边梯形阴影**（面积、∫ 符号）。
- M2 仅能渲染曲线与点标注；命题若强行用 `segment` 伪造切线或手工 polygon 阴影，既不符合 Pack 契约，也无法做「题干数值 ↔ scene」机判。
- 若继续「拒绝入库 + 人工补图」，微积分如图题无法批量闭环。

### 1.2 M3 目标（一句话）

在 **`pack: "math.function"`、`version: 1`** 下新增声明式元素 **`tangent`**、**`integral_region`**；服务端用 **curve 的 expr 在本地求导/定积分** 确定性渲染切线与 x 轴阴影；**G4 对齐**题干中的 a、k、[a,b] 与 scene 数值；失败则拒绝入库，**不得**用题号分支或关键词模板凑图。

### 1.3 用户价值

- 命题 AI：切线/面积题有与 M2 同级、可文档化的 `figure_scene` 字段。
- 学生/印刷：切线斜率、阴影区间与题干叙述可核对。
- 工程：复用 M2 表达式引擎、闸门与 `tryProcessMathFunctionScene` 编排，**不新建 Pack**。

---

## 2. M3 范围

### 2.1 In Scope（M3 必须交付）

| # | 能力 | 说明 |
|---|------|------|
| S1 | **元素 `tangent`** | 声明切点 `at_x`、引用 `sampled_curve`；服务端算 f(a)、f′(a) 画切线段 |
| S2 | **元素 `integral_region`** | 声明 x 区间 [x.min, x.max]、引用曲线；服务端填充曲线与 baseline（默认 x 轴）之间区域 |
| S3 | **parse / validate 扩展** | `mathFunction.shared.ts` 识别新 type；域、引用 id、区间 ⊆ axes/curve domain |
| S4 | **render 扩展** | 切线：`y = f(a) + f′(a)(x − a)` 在 `span` 内绘制；阴影：path clip + fill，半透明 |
| S5 | **G4 对齐扩展** | 题干「x=a」「斜率 k」「区间 [a,b]」与 scene 数值交叉验证（见 §4.4） |
| S6 | **求导/积分数值** | 复用 `mathFunctionExpr`；f′ 用对称差分或文档化公式；∫ 用固定点数 Simpson/梯形，**禁止**手填面积数值作为主路径 |
| S7 | **命题契约** | `submit_exam` schema 描述、`SYSTEM_PROMPT`：微积分如图题仍用 `math.function`，可含 `tangent` / `integral_region` |
| S8 | **标定扩容** | 在 M2 标定基础上新增 ≥ **10** 道切线/积分题（正例 + 负例）；合计 function 标定 ≥ **30** |
| S9 | **单测** | tangent 斜率/过点、integral 区间 clip、对齐失败负例、渲染确定性 |
| S10 | **文档** | 本文档 + `diagram-system.md` M3 状态；M2 PRD §6.3 指向本文 |

### 2.2 场景覆盖（M3 应能稳定支持）

- 幂函数、多项式、sin/cos/exp/log 等在 M2 白名单内的 expr，在定义域内可导点处切线。
- 题干给出切点横坐标 a、斜率 k（或切点坐标）→ scene + G4 一致。
- 定积分几何意义：**y = f(x) 与 x 轴**之间、[a,b] 上阴影（f 在区间内同号或实现文档化的「上 x 轴部分」策略）。
- 单曲线 + 单切线 / 单阴影区；可与 M2 的 `point` 共存（切点标注）。

### 2.3 Out of Scope / 非目标（M3 明确不做）

| 非目标 | 归属 / 说明 |
|--------|-------------|
| **3D 曲面、空间曲线** | 不在 `math.function` |
| **参数方程** x(t), y(t) | M4+ 或单独立项；M3 仅 y=f(x) |
| **极坐标** r=f(θ) | 同上 |
| **隐式曲线** F(x,y)=0 | 同上 |
| **傅里叶/级数逼近图、泰勒多项式对比图** | 除非实现成本极低且纳入标定，否则 **M3 不做** |
| **多条曲线围成区域**（两曲线之间 ∫） | M3+；M3 仅 **曲线—baseline（默认 x 轴）** 单区域 |
| **变上限积分、动态边界动画** | 非静态 SVG 范围 |
| **题干只给面积数值、不给区间或 expr** | G4 无法对齐 → **拒绝**，不得反推区间 |
| **用 `segment` 手画切线代替 `tangent`** | 永久禁止作为主路径 |
| **用 `figure_spec` 或关键词猜切线/阴影** | 永久禁止 |
| **按题号 / 答案 / 卷 ID 硬编码** | 永久禁止 |
| **新建 `math.calculus` Pack** | M3 明确为 **math.function 扩展** |
| **Critic G5、人工队列产品化** | M4+，不阻塞 M3 |
| **符号 CAS 化简、精确有理切线** | M3 采用数值 f′/∫ + 文档化 ε；不承诺 CAS |

---

## 3. 验收标准（可测）

以下均可通过 **单元测试 / 标定 JSON / 固定 scene** 判定。

### 3.1 Pack 行为（切线）

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-M3-1 | `tangent` 解析 | 合法 JSON（§4.2.4）→ parse 成功；缺 `at_x` / 未知 `curve` → null 或 validate 失败 |
| AC-M3-2 | 切点 ON 曲线 | `at_x` 处 \|f(a)−y_curve(a)\| ≤ 1e−6（y 由 expr 求值） |
| AC-M3-3 | 切线斜率 | 渲染前内部 k = f′(a)；标定题手算 k 与 \|k_computed − k_hand\| ≤ 1e−4 |
| AC-M3-4 | 切线几何 | SVG 含切线段；切线通过 (a, f(a))；方向与 f′(a) 一致（快照或端点断言） |
| AC-M3-5 | 域约束 | `at_x` ∉ curve.domain 或 `span` 超出 axes → validate 失败 |
| AC-M3-6 | G4 切线对齐 | 题干含「x=a 处切线斜率为 k」且 scene 中 k 偏差 > 1e−3 → `alignWithStem` 失败 |

### 3.2 Pack 行为（积分区）

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-M3-7 | `integral_region` 解析 | 合法 JSON（§4.2.5）→ parse 成功；x.min ≥ x.max → validate 失败 |
| AC-M3-8 | 区间约束 | [x.min, x.max] ⊆ curve.domain 且 ⊆ axes.x |
| AC-M3-9 | 阴影渲染 | SVG 含 fill 路径；仅在 [x.min, x.max] 内非零（bbox 或 path 采样断言） |
| AC-M3-10 | 数值积分自检 | 标定题：Simpson/梯形 ∫_a^b f(x)dx 与手算（初等函数）相对误差 ≤ 1e−3（仅测试，不要求写入 scene） |
| AC-M3-11 | G4 区间对齐 | 题干含「从 a 到 b」「[a,b] 上阴影」且 scene 区间端点偏差 > 1e−3 → align 失败 |

### 3.3 流水线与契约

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-M3-12 | 确定性 | 同一 scene 两次 render → SVG 规范化 hash 一致 |
| AC-M3-13 | tryProcess | 含 tangent 或 integral_region 的合法 scene → ok + 非空 svg |
| AC-M3-14 | 入库 | `generateFigureAttachmentForQuestion` 写回 uri + scene 保留新 elements |
| AC-M3-15 | submit_exam 描述 | 工具 schema / SYSTEM_PROMPT 说明 tangent、integral_region；**不再**写「禁止切线/积分阴影」 |
| AC-M3-16 | M2 回归 | 原 M2 标定 cases 仍 100% 通过 G2–G4（无回归） |
| AC-M3-17 | 标定规模 | function 标定合计 ≥ 30；其中 tangent ≥ 5、integral_region ≥ 5 |
| AC-M3-18 | 机判门槛 | 扩容后标定 G2–G4 **≥ 85%**（与 M2 同门槛；全数学 90% SLO 仍 M4 复评） |
| AC-M3-19 | 无硬编码 | grep：渲染/对齐无 questionId、order_index、答案分支决定切线/阴影 |
| AC-M3-20 | 文档 | 本文档 + diagram-system M3「进行中」+ registry 描述含 M3 图元 |

### 3.4 负例（必须拒绝）

| ID | 验收项 | 通过条件 |
|----|--------|----------|
| AC-M3-N1 | 瞎填斜率 | 题干 k=2，scene tangent at_x 处 f′(a)≠2 → G4 失败 |
| AC-M3-N2 | 区间不符 | 题干 [0,2]，scene integral x=[0,1] → G4 失败 |
| AC-M3-N3 | 缺专用元素 | 微积分切线/面积题干 + scene 无 tangent/integral → 标定负例 `expectOk: false` |

---

## 4. `figure_scene` 字段草案（v1 扩展）

**外壳不变**（与 [M2 §4](./prd-math-function-m2.md#4-figure_scene-字段约定草案v1)）：

```json
{
  "pack": "math.function",
  "version": 1,
  "elements": []
}
```

M3 **不 bump version**；新增 `elements[].type` 枚举值。M2 已有 type 保持兼容。

### 4.1 组合规则

| 题干类型 | 最低 elements |
|----------|----------------|
| 纯函数图像 | `axes` + `sampled_curve`（M2） |
| 切线题 | 上式 + **`tangent`**（+ 可选 `point` 标切点） |
| 定积分/面积题 | 上式 + **`integral_region`** |
| 切线 + 面积 | 上式 + `tangent` + `integral_region`（标定至少 1 题） |

M3 元素 **必须** 通过 `curve` 引用 `sampled_curve.id`（id 缺失时 validate 失败）。

### 4.2 元素类型

#### 4.2.4 `tangent`（切线）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"tangent"` | ✓ | |
| `id` | string | | |
| `axes` | string | ✓ | 引用 `axes.id` |
| `curve` | string | ✓ | 引用 `sampled_curve.id` |
| `at_x` | number | ✓ | 切点横坐标 a |
| `span` | `{ min, max }` | | 切线 x 显示区间；缺省 Δ=(axes.x.max−axes.x.min)/4 |
| `style.stroke` | string | | 默认 `"#dc2626"` |
| `style.width` | number | | 默认 `2` |
| `style.dashed` | boolean | | 默认 `false` |
| `label.text` | string | | 如「切线 l」 |
| `show_touch_point` | boolean | | 默认 `true` |

**渲染**：y = f(a) + f′(a)(x−a)；k **仅**由 expr 数值求导导出，scene **不得**手填 `slope`。

#### 4.2.5 `integral_region`（x 区间阴影）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"integral_region"` | ✓ | |
| `id` | string | | |
| `axes` | string | ✓ | |
| `curve` | string | ✓ | 引用 `sampled_curve.id` |
| `x.min` / `x.max` | number | ✓ | [a,b]，a < b |
| `baseline` | `"x_axis"` \| number | | 默认 `"x_axis"`（y=0） |
| `fill` | string | | 默认 `"#3b82f6"` |
| `fill_opacity` | number | | 默认 `0.25` |
| `label.text` | string | | 如「阴影部分」 |

**渲染**：曲线与 baseline 间闭合 path + fill；**不得**手填 `area` 字段。

### 4.3 完整示例

```json
{
  "pack": "math.function",
  "version": 1,
  "elements": [
    {
      "type": "axes",
      "id": "ax1",
      "x": { "min": -1, "max": 4, "tick_step": 1 },
      "y": { "min": -2, "max": 6, "tick_step": 1 },
      "grid": { "major": true }
    },
    {
      "type": "sampled_curve",
      "id": "f1",
      "axes": "ax1",
      "expr": "x^2",
      "domain": { "min": -1, "max": 4 },
      "samples": 256
    },
    {
      "type": "tangent",
      "axes": "ax1",
      "curve": "f1",
      "at_x": 2,
      "span": { "min": 0, "max": 4 },
      "label": { "text": "切线" }
    },
    {
      "type": "integral_region",
      "axes": "ax1",
      "curve": "f1",
      "x": { "min": 0, "max": 2 },
      "fill_opacity": 0.3,
      "label": { "text": "阴影部分" }
    }
  ]
}
```

题干：「抛物线 y=x² 在 x=2 处切线斜率为 4；阴影为 [0,2] 上曲线与 x 轴围成区域。」

### 4.4 G4 对齐规则（`alignMathFunctionWithStem` 扩展）

| 题干模式 | 提取 | 比对 |
|----------|------|------|
| x= / 横坐标 + 数 | a | `tangent.at_x` |
| 斜率 / 切线斜率 + k | k | f′(a) |
| 从 a 到 b / [a,b] / ∫_a^b | a,b | `integral_region.x` |

题干仅有面积数值无区间 → 不对面积做 G4；区间与 expr 仍须一致。

---

## 5. 与 `submit_exam` / 闸门交互

### 5.1 Pack 枚举

**不变**：仍为 `"math.geometry" | "math.function"`，不新增 pack。

### 5.2 Schema / SYSTEM_PROMPT

- 删除「禁止切线/积分阴影」。
- 增加 `tangent`、`integral_region` 字段说明；链到本文档。
- 微积分如图题 **仍用** `math.function`，不得用 geometry 伪造。

### 5.3 处理顺序

```
submit_exam → pack===math.function → tryProcessMathFunctionScene
  → validate → alignWithStem(M3) → renderSvg → uri=/figures/... 或拒绝
```

### 5.4 闸门

| 闸门 | M3 |
|------|-----|
| G1 | 如图题须合法 scene 或 URI（不变） |
| G2 | tangent/integral 引用与域 |
| G3 | SVG 含切线/阴影图元 |
| G4 | a、k、[a,b] 数值对齐 |
| G5–G6 | M4+ |

`figureRequireGate` 无需新 pack；失败文案可指向 prd-math-function-m3。

---

## 6. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 数值求导误差 | G4 误拒/误放 | 固定 h；容差 1e−3；标定边界 a=0 |
| f 变号区间阴影 | 面积语义歧义 | 实现 PR 固定策略 + 标定；变号复杂题标 M3+ |
| 不可导点 | 切线 render 失败 | validate：f′(a) 非有限则拒绝 |
| 模型只写面积不写区间 | 无法 G4 | prompt 禁止；拒绝入库 |
| segment 伪造切线 | 绕过契约 | 标定负例 + CR |
| M2 回归 | 破坏已有题 | AC-M3-16 全量回归 |
| 范围膨胀 | 延期 | §2.3 非目标作 CR 依据 |

### 6.1 依赖

M2 `mathFunctionExpr` + `tryProcess`（已满足）；`exam-generation.server.ts` prompt 更新；数值微积分模块（可 `mathFunctionCalculus.shared.ts`）。

---

## 7. 里程碑

| 代号 | 内容 | 状态 |
|------|------|------|
| M2 | axes + sampled_curve | 已落地 |
| **M3** | 切线 + 积分区 | **已落地** |
| M4+ | Critic、两曲线间区域、参数方程 | 待 M3 |

---

*文档版本：2026-07-18 · 作者：产品经理（Agent）*
