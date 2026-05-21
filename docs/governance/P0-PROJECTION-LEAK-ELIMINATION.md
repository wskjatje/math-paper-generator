# P0 — Projection Leak Elimination（Train 1）

**状态**：Implemented

**性质**：constitutional hotfix（authority-safe）；**非** figure role / packing runtime。

## 问题

EPL 主投影与以下路径形成**双通道 cognition projection**：

1. `RasterFigureAppendix`（`exam.$id.tsx`）在 `EducationalDocumentRenderer` 之后仍渲染 stem URLs  
2. `injectRegistryFiguresIntoEducationalAst` 将未匹配 registry 图 append 为 **root-level** `end_fallback` block 图

违反 **projection uniqueness**（ADR-O18）；污染后续 packing fidelity 观测。

## 修复

| 改动 | 文件 |
|------|------|
| 附录 URL 去重 | `projectionLeakGuard.shared.ts` → `filterRasterAppendixUrlsForEplPresentation` |
| 卷面 EPL 单例 document | `exam.$id.tsx` |
| Registry URL/label 匹配 + 禁止 root orphan | `injectRegistryFiguresIntoEducationalAst.shared.ts` |

## 验证

```bash
npm run test -w @zhixue/web -- src/lib/projectionLeakGuard.shared.test.ts src/lib/injectRegistryFiguresIntoEducationalAst.shared.test.ts
npm run governance:projection-purity -w @zhixue/web
```

## 下一 Train

P3.4-1 Figure Cognitive Role（单独 PR / 提交）
