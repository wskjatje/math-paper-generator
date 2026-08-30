# WBS：math.function M3（切线 + 积分区）

> 对应 [prd-math-function-m3.md](./prd-math-function-m3.md)。状态：已落地。

| 工作项 | 产出 | 状态 |
|--------|------|------|
| W1 数值微积分 | `mathFunctionCalc.shared.ts`（对称差分 / 梯形积分） | 完成 |
| W2 parse/validate | `tangent` / `integral_region`；禁 slope/area | 完成 |
| W3 render | 切线线段 + 阴影 path；data-kind 可机判 | 完成 |
| W4 G4 对齐 | a、k、[a,b] ↔ scene | 完成 |
| W5 命题契约 | exam-generation / figureSvgAi 去掉「禁止切线/阴影」 | 完成 |
| W6 标定 | cases ≥30；tangent≥5、integral≥5；负例 N1–N3 | 完成 |
| W7 单测 + 注册表 | AC-M3-*；registry / diagram-system 标已落地 | 完成 |

验证：`npm test -- src/lib/diagram/`
