# 题图系统（Diagram Contract）

> 目标：题干写「如图」时，必须有可解读的正确图；禁止关键词瞎猜、禁止硬编码某题答案。  
> 策略：先数学，后其他学科；正确率用标定集度量（目标约 90% 机判过门，其余人工）。

## 1. 原则

| 原则 | 含义 |
|------|------|
| Spec 先于像素 | 先产出可校验的 `figure_scene`，再确定性渲染 SVG |
| 无图不入库（如图题） | 题干含配图依赖且无有效图时，拒绝保存/发布 |
| 不硬编码 | 禁止按题号/标准答案分支；只按 scene + 校验规则 |
| 不猜模板 | 关键词模板不得作为「如图」主路径 |
| 分科 Pack | 共享闸门与流水线；学科差异只在 Pack 内 |

## 2. 流水线（所有学科共用）

```
命题 → figure_scene(JSON) → Pack 校验 → 确定性渲染 SVG → 对齐检查 → Critic(可选) → 入库/发布
                                    ↓ 失败
                              拒绝 / 人工队列
```

闸门：

1. **G1** 题干需要图 → 必须有 `figure_scene` 或已渲染有效 URI。默认对**已有 active Pack 的学科**硬拦（数学、物理力学）；`planned` 学科暂不硬拦。回退：`MPG_FIGURE_GATE_MODE=strictMath` 仅拦数学。  
2. **G2** Pack 校验（schema + 学科不变量）  
3. **G3** 渲染成功且 SVG 非空  
4. **G4** 题干↔scene 对齐（标签、关键数量、**具名线段长度比**等）  
5. **G5** Critic（后续；不一致则拒绝）  
6. **G6** 人工抽检（标定集外 / 低置信）

## 3. 落地顺序

| 阶段 | 内容 | 状态 |
|------|------|------|
| **M0** | 契约、注册表、如图闸门、文档 | **已落地** |
| **M1** | `math.geometry` scene + 渲染 + 对齐 + 标定度量 | **已落地（如图题已禁用 template_high / figure_spec 回退）** |
| **M2** | **`math.function` Pack**（表达式 + 视窗 → 本地采样曲线；详见 [prd-math-function-m2.md](./prd-math-function-m2.md)） | **已落地** |
| **M3** | 微积分图元（切线、积分区）+ function 标定扩容；PRD 见 [prd-math-function-m3.md](./prd-math-function-m3.md) | **已落地** |
| M4+ | Critic、人工队列、全数学 SLO；按注册表启用其他学科 Pack（`physics.mechanics` 已先行落地） | **进行中** |

**M1 说明**：parse/validate/render/G4 与标定已就绪。如图题配图：**禁止** `template_high` / `figure_spec` / 自由 SVG 旁路，须 `figure_scene` 或题干几何事实解算成功；G1 仍兼容「已有有效 URI」的导入卷。

**「数学完成后补全其他学科」**：指同一套流水线 + `data/diagram-packs/registry.json` 登记项，达标后用 `npm run diagram:scaffold-next` 按序脚手架并实现 Pack（校验/渲染/标定），**不是**无人审核地让模型自动发明理化生地规则。

## 4. 学科 Pack 待办（登记，先不实现）

权威清单见 [`data/diagram-packs/registry.json`](../data/diagram-packs/registry.json)。摘要：

| pack_id | 学科 | 状态 | 说明 |
|---------|------|------|------|
| `math.geometry` | 数学 | `active` | 平面几何、网格、轴对称等 |
| `math.function` | 数学 | `active` | 函数图像（axes+sampled_curve；M3 扩展 tangent/integral_region；支持 label{axes,x,y,text} 自由文字标注）；PRD 见 [prd-math-function-m2.md](./prd-math-function-m2.md)、[prd-math-function-m3.md](./prd-math-function-m3.md) |
| `physics.circuit` | 物理 | `planned` | 电路图 |
| `physics.mechanics` | 物理 | `active` | 受力/简单机械示意；见 [prd-physics-mechanics.md](./prd-physics-mechanics.md) |
| `physics.optics` | 物理 | `planned` | 光路 |
| `chemistry.apparatus` | 化学 | `planned` | 仪器装置 |
| `chemistry.particle` | 化学 | `planned` | 粒子/微观模型示意 |
| `biology.structure` | 生物 | `planned` | 结构示意图 |
| `geography.map` | 地理 | `planned` | 地图/等值线示意 |
| `chinese.illustration` | 语文 | `planned` | 仅当题干明确配图时 |
| `english.diagram` | 英语 | `planned` | 图表类阅读配图 |

新增 Pack 验收：schema + 校验 + 渲染 + ≥20 标定题 + 对齐规则 + 文档小节。

## 5. 字段约定

题目 `attachments[]` 中：

```json
{
  "kind": "figure",
  "uri": "pending://figure",
  "alt": "简短文字说明",
  "figure_scene": {
    "pack": "math.geometry",
    "version": 1,
    "elements": []
  }
}
```

- `figure_scene`：权威结构（新路径）  
- `figure_spec`：旧字段，仅高置信兼容；**如图题不得只靠 figure_spec 关键词猜测**  
- 渲染成功后 `uri` 改为 `/figures/<examId>/...svg`

## 6. 代码入口

| 路径 | 职责 |
|------|------|
| `src/lib/diagram/` | 契约、数学 Pack、闸门 |
| `src/lib/diagram/geometryFacts.shared.ts` | 题干几何事实/数值 → 约束解算 scene（禁关键词瞎猜） |
| `data/diagram-packs/registry.json` | Pack 状态与 backlog |
| `src/lib/figureGeneration.server.ts` | 编排：事实解算 → AI figure_scene → 高置信显式模板 → AI SVG |

## 7. 成功标准（数学）

在标定集上定义：

- **机判通过率**：G1–G4 通过且人工抽检认为「可解题」≥ 目标（约 90%）  
- **误配率**：错图导致无法按题干解题 → 计失败  
- 未达目标前：**不**批量开启其他学科 Pack
