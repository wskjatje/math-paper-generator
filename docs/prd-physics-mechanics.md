# PRD：`physics.mechanics` Pack

> **状态**：已实现（Pack + 闸门分发 + 标定单测）  
> **关联**：[题图系统总览](./diagram-system.md) · [Pack 注册表](../data/diagram-packs/registry.json)  
> **约束**：禁止按题号/答案硬编码；禁止关键词猜装置类型；scene 须由题干/显式字段驱动并可校验。

## 1. 目标

初中物理「如图」力学示意（浮力、滑轮组、连通器、斜面、杠杆等）走与数学相同的 **Spec → 校验 → 确定性 SVG** 路径，`pack: "physics.mechanics"`。

## 2. Scene v1 图元

| type | 字段 | 用途 |
|------|------|------|
| `point` | id,x,y,label? | 锚点 / 点名 A、B、O |
| `segment` | from,to,style? | 杆、绳、轮廓边 |
| `polygon` | points[] | 斜面三角形、支座等 |
| `rect` | x,y,width,height,label? | 块体、容器 |
| `circle` | center,r | 滑轮轮 |
| `liquid` | points[] | 液面下区域 |
| `force` | from,to,**label** | 受力箭（label 必填） |
| `arrow` | from,to | 无标签方向箭 |
| `label` | at,text | 水面、s、h 等文字 |

端点 `from`/`to`/`at`/`center` 可为点 id 或 `[x,y]`（与 math.geometry 相同：坐标由模型显式给出，再补匿名锚点）。

## 3. 闸门

- **G2** schema + 引用完整性（点存在、force 有 label）
- **G3** 渲染非空 SVG
- **G4** 题干点名（点/端/支点/杠杆 AB/A、B 两点等）与 scene 对齐；force 标签须能在题干力名集合中找到

## 4. 非目标

- `physics.circuit` / `physics.optics`（独立 Pack）
- 按「浮力」「滑轮」等关键词自动猜模板
- 按卷 ID / 题号写死 SVG
- 在代码中捏造题干未给出的尺寸或答案

## 6. 渲染可读性（本 Pack 内）

- 力标垂直偏移加大，并加白边描边，避免压在箭杆上  
- 与 `rect.label` 同名的 `force` 不再重复画文字（防 G₁ 叠字）  
- SVG `width/height` 为 viewBox 的 2 倍，仅改善本 Pack 作为 `<img>` 时的清晰度；**不改** `math.geometry` / `math.function` / 全局附件组件
