# Stabilization logs（存放约定）

**性质**：演化观察（evolutionary observation）；**不是** governance artifact。

## 1. 日志放哪

- 模板：[docs/governance/PACKING-STABILIZATION-LOG-template.md](../governance/PACKING-STABILIZATION-LOG-template.md)  
- 填写后的纪要：本目录下按日期，例如 `docs/stabilization-logs/2026-05/packing-stabilization-YYYY-MM-DD.md`（或附在 Issue / PR，不强制入库）  
- 卷/题仅作**备注**，不作 runtime ID（见 [generic-exam-content-policy.md](../governance/generic-exam-content-policy.md)）

## 2. 不进 CI / telemetry / parity

Stabilization log **不得**：

- 进入 CI gate、parity-regression、resilience-regression 输入  
- 写入 telemetry snapshot 或 scoring  
- 驱动 runtime 分支或 transform 触发  

## 3. stabilization log ≠ governance artifact

| 工件 | 角色 |
|------|------|
| Telemetry / snapshot（Train 4+） | governance truth |
| **Stabilization log（当前）** | observational substrate；词汇可演化；允许分歧与未定性记录 |

阶段：*constitutional stabilization before observational governance freeze*。  
评审锚点：[PACKING-STABILIZATION-CHECKLIST.md](../governance/PACKING-STABILIZATION-CHECKLIST.md) · [ECR-RUNTIME-CONSTITUTION-v1.md](../governance/ECR-RUNTIME-CONSTITUTION-v1.md)
