# 教育试卷导入管线（Education-AI 方向）

本文说明「商用级结构化解析」方案与本仓库**当前已实现**能力的对应关系，便于后续外接 MinerU、专线公式 OCR、LangGraph 等模块时对齐数据契约。

## 已实现（确定性 / HITL）

- **入库前清洗**：`questionImportSanitize.shared.ts` 等对题干、选项做规则化整理；经 **`importFormulaPipeline.shared.ts`** 默认入口 `runDefaultImportFormulaPipelineInRepo`（当前等同 `importLatexOcrNormalize`：`repairExamMathCanonicalSync` 之上修补 `^{\wedge}n`、`10^{\wedge}n`、`tan60*` 等 OCR 残留）。
- **大题标题跨行**：`importSectionContext.shared.ts` 的 `parseImportDocumentSections` 在括号未闭合时最多向下合并 8 行再解析「本大题共 n 小题」等。
- **导入解析质检 v1**：`importParseQuality.shared.ts` 按题收集信号（缺预期卷面图、占位答案、单选多字母答案、选择题选项不足、占位解析、**√ 误识 Vnn 提示**、**「科学记数」语境下 N 万与所选选项数值形式不一致」启发式**等），汇总为 `green` / `yellow` / `red` 档与 `summary_lines`。
- **持久化**：清洗后的快照写入 `exam.import_parse_quality`（JSON）。Supabase 列为 `jsonb`；MySQL 为 `JSON`，并在运行时对缺列库执行 `ALTER TABLE` 自愈（见 `mysqlExamStore.server.ts`）。
- **界面**：导入卷且非绿档时，试卷详情页展示质检提示（`exam.$id.tsx`）；导入线下卷列表卡片展示「质检·黄/红」角标（`offline-imports.tsx`）。
- **大题语境（P0）**：`importSectionContext.shared.ts` 从 OCR 行解析「一、选择题（本大题共 n 小题，每小题 m 分）」等；逐题导入时注入提示并在合并后 **强制纠正** 区间内题目的 `type`/`points`（`exam-generation.server.ts`）。题号锚点对 `(1)` 与 `第(1)题` **去重**，避免同一题被切两段（`importDocumentPerQuestionSplit.shared.ts`）。
- **占位 bbox（默认）**：`QuestionRasterFiguresV1.stem_bbox_norm` / `by_option_bbox_norm` 与 URL 数组同序；`materializeQuestionRasterFigures` 在缺省或与 URL 条数不一致时用纵向分条 **0–1 归一化占位** 填满（`importRasterFigures.shared.ts`），供裁剪/调试及外接真 bbox 对齐。
- **数值等价（默认）**：`importNumericEquivalence.shared.ts` 从选项/题干解析科学记数法与普通数字（纯 TS）；质检「N 万 + 科学记数」场景下若所选选项数值等价则**不再误报**（`importParseQuality.shared.ts`）。
- **公式管线（默认）**：`importFormulaPipeline.shared.ts` 的 `runDefaultImportFormulaPipelineInRepo` 即仓库内确定性公式处理入口（当前等同 `normalizeImportPipelineLatexResidue`）；入库清洗已统一经此入口。

迁移文件：

- `supabase/migrations/20260508201500_exams_import_parse_quality.sql`
- `sql/mysql/migrations/20260508201500_exams_import_parse_quality.sql`

## 规划 / 外接（增强项；核心能力已在仓库内默认具备）

- **版面分析（高精度）**：MinerU、PP-Structure、DocLayout-YOLO 等，输出真几何 bbox 与阅读顺序；入库后可写入 `raster_figures.stem_bbox_norm` / `by_option_bbox_norm` **覆盖**本仓库默认的纵向分条占位。
- **数学专线 OCR（高精度）**：Texify、Mathpix 等，与通用 OCR 分离；可在 `runDefaultImportFormulaPipelineInRepo` 同一入口前插入异步识别，再回落到确定性规则。
- **图文绑定（版面级）**：bbox 最近邻题号 +「如图」等关键词的联合推断；禁止无图时伪造图或占位推导（策略不变）。
- **编排**：LangGraph 等将多节点流水线产品化（可选）。

标准题级 JSON 可继续向方案中的结构演进；当前质检结果已嵌在 `import_parse_quality.questions[]` 中，可与未来版面引擎输出合并版本号（如 `version: 2`）。

---

## 实施路线图（对照：图文断层、大题继承、LaTeX、HITL）

以下与「和平区卷」类现象对齐：**有文无图 / 题型分值与大题不符 / LaTeX 非规范**。优先级为工程可交付顺序，而非仅概念列表。

### 阶段一（P0）：版面语义与锚点 — 减少「孤立小题」

| 目标 | 现状锚点 | 建议落地 |
|------|-----------|----------|
| 大题标题 → 子题属性继承 | 逐题 AI 仅按 `(1)` 切段（`importDocumentPerQuestionSplit.shared.ts`），**未**解析「一、选择题…每小题 3 分」 | 在切段**之前**增加 **section 扫描层**：用正则/轻量规则提取「一、选择题」「二、填空题」及括号内「每小题 * 分」；生成 `SectionContextV1`（题型默认、分值默认、题号范围），在调用 `runImportDocumentAiGenerationForSlice` 时 **注入 system 或前缀**，并在合并后做 **确定性覆盖**（同 section 内 MCQ 强制 `points=3`、`type=multiple_choice`，除非题干明确为其他题型）。 |
| 题号锚点扩展 | 仅 `(1)` / `（2）` 行首匹配 | 增加 **`第(1)题`**、**`第（2）题`** 等与卷面图注一致的锚点，参与切段或与图块 bbox 对齐（先文本锚点，后接版面引擎 bbox）。 |
| 冲突校验 | 质检有红/黄档，但不改 AI 错分题型 | 在 `questionImportSanitize.shared.ts` 或独立 `importSectionReconcile.shared.ts` 中：若 `SectionContext` 为选择题区且模型输出 `short_answer`，触发 **一次重试**或 **强制改 type + 记录 signal**。 |

### 阶段二（P0）：图文绑定 — 解决「依赖卷面图但未入库」

| 目标 | 现状锚点 | 建议落地 |
|------|-----------|----------|
| 图块进题 | `offline_import_media`、`raster_figures`、`figure_dependency`（`importRasterFigures.shared.ts`、裁图流程） | **锚点 + 顺序**：OCR/版面输出带 `question_anchor` 与 `bbox`；裁图 URL 写入 `raster_figures.stem` 或选项键；与 `questionMissingExpectedRasterFigures`（`importParseQuality.shared.ts`）对齐，使绿档可达成。 |
| 无图禁占位推导 | 策略已部分在渲染/命题侧 | 导入合并后：若 `figure_dependency.requires_figure` 且无 raster，**不写**虚构解析；质检已标红，可再加 **禁止入库为 confirmed** 的可选策略（产品开关）。 |

### 阶段三（P1）：数学与 LaTeX 确定性

| 目标 | 建议落地 |
|------|----------|
| 规范化 `10^{\wedge}4` 等 | 仓库内 **`normalizeImportPipelineLatexResidue`**（`importLatexOcrNormalize.shared.ts`）+ 入库 `sanitizeImportedQuestionForPersist`；Sympy/数值强校验仍属规划。 |
| 数值闭环（科学记数法等） | 可选微服务或本地 `sympy` 子进程：对题干中「50 000」与选项 LaTeX 做 **数值等价校验**；不等则 `import_parse_quality` 增加 signal（版本 bump）。 |

### 阶段四（P2）：外接引擎与编排

| 模块 | 说明 |
|------|------|
| 版面 | MinerU / PP-Structure 等输出 **阅读顺序 + 块类型 + bbox**；与现有 `splitImportDocumentIntoQuestionChunks` 合并为「文本流 + 块引用」。 |
| 公式 OCR | Texify / Mathpix 专线路径；与正文 OCR 分离后写入 `content`/`options` 前再过 LaTeX 规范化。 |
| 编排 | LangGraph 将：section 扫描 → 切段 →（可选）公式 OCR → submit_exam → section  reconcile → 质检 → 失败分支；节点失败写 `import_parse_quality` 而非静默成功。 |

### 阶段五（HITL 产品化）

- 详情页质检横幅（`exam.$id.tsx`）与列表角标（`offline-imports.tsx`）已具备；可增：**按题跳转裁图**、**一键应用 section 默认题型分值**。
- 占位文案拦截：扩展 `importParseQuality` 中 `PLACEHOLDER_STEP_MARKERS` / 答案占位检测，与 **确认入库** 闸门联动（可选）。

### 代码索引（便于拆 PR）

- 导入 AI 主路径：`exam-generation.server.ts`（`runImportDocumentAiGeneration*`、`buildImportedExamSnapshotFromAiParsed`）、`exam.functions.server.ts`（`importOfflineExamFromDocument`）。
- 切段：`importDocumentPerQuestionSplit.shared.ts`。
- 图与 Markdown 协调：`reconcileSubmitExamPayloadWithImportFigures` 等（同文件或 `importRasterFigures` 相关模块）。
- 清洗与质检：`questionImportSanitize.shared.ts`、`importParseQuality.shared.ts`。
- 契约说明：本文档 + `schemas/v1/`（若增加 `section_context` 字段需同步 schema 与 `make validate`）。
