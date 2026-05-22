# 试卷页 OCR 整体改进方案（左文右图 / 含图几何卷）

本文针对 **九年级数学卷第 4 页类版式**：左侧题干 + 右侧示意图 + 下方双栏选项。当前「整页一条流式 OCR」会把 **图内标注、栏外噪声、跨栏碎片** 拼进正文，导致 `PN`、`OLEH`、`FRE`、`WEE` 等垃圾串；符号（△、∠、弧、分数、tan）与 **A↔4、D↔刀** 等混淆在规则层只能部分缓解。

## 一、问题归因（按优先级）

| 现象 | 根因 | 单靠通用 OCR 能否解决 |
|------|------|------------------------|
| 题干中夹杂 `PN`、`D`、`OLEH`、`FRE` 等 | **图文未分离**：图区竖排字、标注线被当作正文流 | 否，必须版面/区域 |
| `A4BC`、`48=4C`、`正方形48BCD` | 拉丁字母与数字形近 | 部分（规则+公式通道） |
| `∠A=36*`、`tan ZBFE` | **公式/角度域**未走专用识别 | 否，需公式分支或 LaTeX OCR |
| `DE=S$`、`m=72` 与选项错位 | **双栏选项**未结构化 | 否，需选项区检测或版面列 |
| 第 (10) 题步骤①②③④仍混乱 | **圈码与换行**与图注交错 | 版面块 + 阅读顺序 |

结论：**不是「换一个 Tesseract/Paddle 模型名」能彻底解决**，需要 **版面驱动的分块识别 + 块内专用模型 + 最后语义修复**。

## 二、目标架构（与仓库可插拔 OCR 对齐）

```
扫描页
  → 图像预处理（倾斜校正 / 去噪 / 可选 CLAHE）
  → 版面分析（PP-StructureV3 或等价：文本块 | 图片块 | 表格块 | 标题块）
  → 区域路由
        ├─ 文本块 → PaddleOCR（或多语言）
        ├─ 公式块 → UniMERNet / pix2tex / LaTeX-OCR（输出 LaTeX 或简化符号串）
        ├─ 图片块 → YOLO 几何要素（可选）+ **不把图内 OCR 混进题干**，仅产出 bbox/标签
        └─ 选项区 → 列分割或单独裁剪双栏后再 OCR
  → 阅读顺序排序（块 centroid / 拓扑序）
  → 块结果合并为 StructuredExamOcrDocument（已有 types + gatewayAdapter）
  → Web：geometryRecognizer + educationCorrector + educationSymbolLexicon + normalize
  → 可选：AI 语义修复（repairOfflineOcrTextWithAi）
  → 入库 / 向量化（下游）
```

与现有实现的映射：

- **网关** `POST /api/v1/ocr/image`：扩展/稳定 `blocks[].kind、bbox、text、formula_latex、geometry_label`。
- **Web**：`runPluggableOcrPipeline` 已预留；规则层在 `offlineExamOcrNormalize.shared.ts`、`educationSymbolLexicon.ts`。
- **持久化**：可选 `exam_ocr_artifacts` 存 pipeline 快照便于回归。

## 三、分阶段落地（建议）

### 阶段 A — 立刻降低噪声（1～2 周）

1. **版面粗分**：至少检出 **大图画布矩形**，在送 Paddle 前 **抠图 mask**（白填或剔除），避免绝大多数图内字母进入题干流。  
   - 无 PP-Structure 时可用：**纵向投影切分**（左 55% 文本 / 右 45% 图）作为 **可配置试卷模板**，对本页版式够用。
2. **题干区单独 OCR**：只对左栏 ROI 跑全文 OCR；右栏可选「仅标签识别」或跳过。
3. **选项区**：footer 上方裁剪 **固定高度条带** 专跑 OCR，或与题干分开合并。
4. **规则与词典**：继续在 `educationSymbolLexicon` / `normalizeMathExamOcrText` 迭代；对 **弧/画弧/红**、**步骤圈码** 保持与 `@以点` 同类策略。

### 阶段 B — 版面与公式（3～6 周）

1. 接入 **PP-StructureV3**（或 Paddle 文档解析），输出稳定 **block + reading_order**。
2. **公式块**走独立推理（UniMERNet 等），写入 `formula_latex`，题干 plaintext 用占位或与公式块并排渲染。
3. **角度 / tan / 分数**：优先公式通道；plain 文本再做 **二次规范化**（已有 `∠`、`L4` 等规则可扩展）。

### 阶段 C — 图形与语义（中长期）

1. **YOLO**：三角形/圆/辅助线类别（可先训公开几何图样本），用于 **diagram role** 与命题校验。（`services/ocr-service`：`diagram_isolation` + `yolo_geometry_classes`）
2. **图文对齐**：记录「第 (10) 题 ↔ 图块 bbox」，前端可按题渲染图（不必把图 OCR 进正文）。（已实现：`diagram_links` + `questions[].diagrams`；YOLO 无检出时 **右栏启发式** `diagram_heuristic`）
3. **学科纠错模型**：本地专用槽 **`localSubjectModels.ocr_repair`**（`purpose: ocr_repair`），与命题 `exam` 分离；云端仍走原网关模型。

## 四、工程与验收指标

| 指标 | 含义 |
|------|------|
| **题干纯净度** | 左栏 OCR 中不可打印噪声串 / 随机拉丁片段占比 ↓ |
| **符号还原率** | △、∠、弧、∥、分数、tan 等在公式或规则 combined 下的正确出现率 |
| **选项对齐** | A/B/C/D 与题干编号配对错误率 ↓ |
| **端到端** | 导入后 AI 命题可用率（无需人工大段改稿）↑ |

建议在 `examples/` 或内部数据集固定 **本页及同类页 5～10 张** 做回归（禁止仅用一张图调参）。

## 五、风险与边界

- **固定左右比例裁剪** 对不同扫描边距敏感：需 **留白检测** 或升级到完整版面模型。
- **规则词典过宽** 会误伤真实数字「4」：保持 **语境触发**（已有三角形 hints）与 **MPG_OCR_COLLAPSE_CJK_SPACE** 等开关。
- **AI 修复** 可能改写数学事实：适合「符号形近替换」，不适合「补全缺失条件」；重要考试应以 **人工预览** 为准。

## 六、仓库内下一步（可拆 Issue）

1. **ocr-service（或网关）**：增加 `layout_mode=exam_two_column` + ROI 参数；返回 **masked_text_blocks**。  
2. **契约**：在 OpenAPI/示例 JSON 中补齐 **reading_order、diagram_bbox**。  
3. **前端**：按题折叠展示「题干 | 公式列表 | 附图占位」，避免一页一大段 textarea。  
4. **评测脚本**：对固定样本跑 OCR → 与人工标注编辑距离 / 符号命中率。

---

*参考样图版式：左侧印刷题干 + 右侧示意图 + 双栏选项；识别样例见用户提供的 `微信图片_20260507084126_359_52` 同类扫描件。*
