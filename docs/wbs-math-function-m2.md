# WBS：`math.function` Pack（M2）

> **范围冻结依据**：[prd-math-function-m2.md](./prd-math-function-m2.md)（无微积分 / 切线 / 积分区）  
> **关联**：[diagram-system.md](./diagram-system.md) · [registry.json](../data/diagram-packs/registry.json)  
> **状态**：排期草案 · 2026-07-18

---

## 1. 项目周期（待确认）

| 里程碑 | 计划窗口 | 说明 |
|--------|----------|------|
| **M2-A** 表达式 + Pack 核心 | D1–D5 | 阻塞后续全部任务 |
| **M2-B** 流水线接入 | D6–D8 | 依赖 M2-A |
| **M2-C** 命题契约 | D9–D10 | 依赖 M2-B（至少 tryProcess 可跑通） |
| **M2-D** 标定 + 单测 | D8–D12 | 与 M2-B/C 可部分并行；**registry active 前必须完成** |
| **M2-E** 注册激活 | D13 | 标定 G2–G4 ≥85% 后启用 |

总工期估算：**约 2–3 周**（单人 backend 为主 + QA 标定审阅）；未含 M3、Critic、人工队列。

---

## 2. 里程碑与依赖顺序

```
M2-A 基础能力
  W1 表达式安全求值
  W2 scene 解析 / 校验 / 渲染
  W3 tryProcess 统一入口
        │
        ▼
M2-B 流水线
  W4 闸门 G1–G4 + figureGeneration 路由
        │
        ▼
M2-C 命题面
  W5 submit_exam schema + SYSTEM_PROMPT + 拒绝文案
        │
        ▼
M2-D 质量
  W6 标定 JSON + 单测 + 机跑脚本
        │
        ▼
M2-E 发布
  W7 registry active + 文档对齐
```

**硬依赖**：W1 → W2 → W3 → W4 → W5；W6 可在 W3 后起草标定、W4 后跑 G2–G4；**W7 必须晚于 W6 达标**。

**软依赖（不阻塞 M2 定义）**：`figureSvgAi.server.ts` AI 补 scene 模板、`geometryFacts` 类推断——M2 不承诺函数题 stem 推断，仅 scene 主路径。

---

## 3. 工作包明细

### W1 · 表达式安全求值

| 项 | 内容 |
|----|------|
| **交付物** | `src/lib/diagram/mathFunctionExpr.shared.ts`（白名单 parse + 受限 evaluate；禁 `eval` / `Function`） |
| **角色** | **backend** |
| **验收 AC** | AC-2、AC-4（有理点 y 手算 ε）、AC-18（安全 review：无任意 JS 执行） |
| **DoD** | 白名单函数/运算与 PRD §4.3 一致；非法 expr 返回结构化错误；单测覆盖注入样例 |

---

### W2 · Scene 解析 / 校验 / 渲染

| 项 | 内容 |
|----|------|
| **交付物** | `src/lib/diagram/mathFunction.shared.ts`（`parseMathFunctionScene` / `validateMathFunctionScene` / `alignMathFunctionWithStem` / `renderMathFunctionSvg`）；必要时扩展 `src/lib/diagram/types.ts` |
| **角色** | **backend** |
| **验收 AC** | AC-1、AC-3、AC-5、AC-6、AC-7 |
| **DoD** | v1 scene（`axes` + `sampled_curve` + 可选 `point`）与 PRD §4 一致；256 默认采样；y 轴翻转映射；`1/x` 类断点策略文档化 |

---

### W3 · 统一 tryProcess

| 项 | 内容 |
|----|------|
| **交付物** | `tryProcessMathFunctionScene`（`mathFunction.shared.ts`）；`src/lib/diagram/index.ts` 导出 |
| **角色** | **backend** |
| **验收 AC** | AC-9 |
| **DoD** | 编排顺序：parse → validate → alignWithStem → render；失败返回非空 `errors[]`；与 `tryProcessMathGeometryScene` 返回形态一致 |

---

### W4 · 闸门 + 生成编排

| 项 | 内容 |
|----|------|
| **交付物** | `src/lib/diagram/figureRequireGate.shared.ts`（G1：geometry **或** function）；`src/lib/figureGeneration.server.ts`（按 `pack` 分发）；入库路径 `src/lib/examStorage/persistQuestionAttachments.server.ts`（若需写回 scene） |
| **角色** | **backend** |
| **验收 AC** | AC-8、AC-9、AC-10 |
| **DoD** | `generateFigureAttachmentForQuestion` 对 `math.function` 写 `/figures/...svg`；G1 失败文案含「math.geometry 或 math.function」 |

---

### W5 · submit_exam 命题契约

| 项 | 内容 |
|----|------|
| **交付物** | `src/lib/exam-generation.server.ts`（`submit_exam` 工具 schema `pack.enum`、SYSTEM_PROMPT §配图、`SUBMIT_EXAM_FIELD_CHEATSHEET`、拒绝保存提示链） |
| **角色** | **backend** |
| **验收 AC** | AC-11、AC-12、AC-13、AC-14 |
| **DoD** | 函数如图题 prompt 要求 `axes` + `sampled_curve`；误填 `math.geometry` 负例在标定/单测可复现 |

---

### W6 · 标定 JSON + 单测

| 项 | 内容 |
|----|------|
| **交付物** | `examples/v1/diagram-calibration/math-function/*.json`（≥20 条，含正例 + 边界/失败清单）；`src/lib/diagram/mathFunction.shared.test.ts`；`src/lib/diagram/mathFunctionExpr.shared.test.ts`（若 W1 独立文件）；可选机跑脚本 `scripts/diagram-calibration-math-function.mjs` |
| **角色** | **backend**（实现 + 机跑）· **qa**（AC-17 人工误配标注、负例清单审阅） |
| **验收 AC** | AC-1–AC-7（单测）、AC-13（负例）、AC-15、AC-16、AC-17、AC-18 |
| **DoD** | 标定机判 G2–G4 **≥85%**；误配人工失败 **≤2/20**；grep CR 无 `questionId`/`order_index`/答案分支决定 curve |

---

### W7 · Registry active

| 项 | 内容 |
|----|------|
| **交付物** | `data/diagram-packs/registry.json`（`math.function.status: "active"` + `module`）；`docs/diagram-system.md` 里程碑表同步 |
| **角色** | **backend**（合并）· **qa**（AC-19/20 核对） |
| **验收 AC** | AC-19、AC-20 |
| **DoD** | W6 达标后合并；未达标保持 `planned` 并阻断批量函数如图命题 |

---

## 4. 实现顺序（强制）

1. **表达式安全求值**（W1）  
2. **Scene 解析 / 校验 / 渲染**（W2）  
3. **统一 tryProcess**（W3）  
4. **闸门 + 生成编排**（W4）  
5. **submit_exam schema + prompt**（W5）  
6. **标定 JSON + 单测**（W6）  
7. **registry active**（W7）

---

## 5. 风险与依赖（摘要）

| 风险 | 关联 WBS | 缓解 |
|------|----------|------|
| 表达式引擎选型延期 | W1 | 优先 mathjs 受限 scope 或自研递归下降；W1 未完成则冻结 W2+ |
| 标定未达 85% | W6–W7 | 不升 `active`；函数如图批量生成保持关闭 |
| pack 混用误放 | W4–W5 | AC-13 负例 + prompt 分流 |
| M2 范围膨胀（切线/积分） | 全部 | CR 对照 PRD §2.3 非目标 |

**外部依赖**：`math.geometry` Pack 模式（parse/validate/render/tryProcess 惯例）——已存在，W2–W3 对齐 `mathGeometry.shared.ts` 即可。

---

## 6. 会话隔离建议

| 工作包 | 建议会话 / 分支 |
|--------|-----------------|
| W1–W3 | `feat/math-function-core` |
| W4–W5 | `feat/math-function-pipeline`（基于 core） |
| W6 | `feat/math-function-calibration`（可并行起草 JSON） |
| W7 | 随 W6 PR 合并或独立 docs/registry PR |

---

*维护：项目经理 · 变更须同步 PRD AC 编号*
