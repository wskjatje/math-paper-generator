# PRD：导入线下试卷 与「生成试卷」的规则对齐 与 导入失败闭环

- 状态：已确认并实现（2026-07-19）
- 决策：
  - 学科无法归一时回退 `IMPORT_DEFAULTS.subject`，并在任务记录保留实际生效学科/回退标记。
  - 本轮纳入导入草稿恢复（“处理已返回结果”）。
- 关联背景：
  - Bug A：导入落到默认模型 → Interactions API 不兼容
  - Bug B：AI 返回 `figure_scene` 的 `viewBox` 无效 → 整卷拒存
- 关联代码（本次只读探索范围）：
  - `src/routes/offline-imports.tsx`、`src/components/ImportOfflineExamDialog.tsx`
  - `src/lib/exam.functions.server.ts`（`importOfflineExamFromDocument` / `importRemoteCatalogEntryAsStaging` / `importWebUrlAsStaging`）
  - `src/lib/exam-generation.server.ts`（`runImportDocumentAiGeneration` / `buildImportedExamSnapshotFromAiParsed` / `runExamAiGenerationWithValidationRetryInner` / `callChatCompletions`）
  - `src/lib/aiRuntime.shared.ts`（`resolveEffectiveAiRuntime` / `normalizeSubjectIdForModelMap`）
  - `src/lib/generationLearning.shared.ts` / `generationLearning.server.ts`
  - `src/lib/generationDraft.server.ts`（命题草稿恢复）
  - `src/lib/figureFinalize.server.ts` / `src/lib/figureGeneration.server.ts`（配图硬闸门，命题与导入共用）
  - `src/lib/remoteImportJobsStorage.ts` / `remoteImportJobs.types.ts` / `src/components/remoteImport/*`（网上导入队列）
  - `src/components/generation/GenerationJobQueues.tsx` / `src/lib/generationJobsStorage.ts`（命题队列，作为对齐目标）
  - `src/components/settings/AiModelCatalogPanel.tsx`（按学科选择模型）
  - `src/lib/userFacingError.shared.ts`（Interactions API 不兼容的用户提示映射）

> 结论先行：**用户结论 1（模型解析规则统一）在代码层面已经基本实现**；真正的缺口集中在**用户结论 2（导入失败可观测 + 重试 + 学习闭环）**，尤其是「文件上传型线下导入」完全没有进入任何任务队列。以下逐项给出可验收标准，并明确标注「规则对齐（已实现）」还是「产品缺口（待排期）」。

---

## 0. 关键发现摘要（先说清楚现状，避免拍板前信息不对齐）

| # | 发现 | 判定 |
|---|------|------|
| 1 | 三条导入入口（文件上传 / 网上目录 / 网页 URL）与命题生成的所有 AI 调用，**最终都经过同一个 `callChatCompletions(body, ai, { purpose, subjectId })` → `resolveEffectiveAiRuntime`**，没有另起一套解析逻辑 | ✅ 规则已对齐 |
| 2 | 设置页「按学科选择模型」（`subjectModelEntryIds`）是**全局单一目录**，被生成与导入共同读取；不存在“导入专属模型配置”和“生成专属模型配置”的分裂入口 | ✅ 规则已对齐 |
| 3 | 三条导入入口在缺失/漏传学科时都有兜底：`normalizeSubjectIdForModelMap` 归一化失败 → 回退 `IMPORT_DEFAULTS.subject`（当前为 `"math"`）；`ImportOfflineExamDialog` 的学科下拉框默认值也是 `"math"` 而非空 | ✅ 规则已对齐（但兜底策略是否应为“阻断并要求用户选学科”而非“默认转 math”，属产品口径问题，见第 4 节风险） |
| 4 | Bug A（Interactions API 不兼容）已有专门识别与用户提示（`formatLocalInferenceError` / `userFacingError.shared.ts`），并指向「设置 → 模型与接口」，命题与导入共享同一段代码 | ✅ 规则已对齐 |
| 5 | 配图硬闸门（`finalizeExamQuestionFiguresHardGate` → `generateFiguresForExamQuestions`）命题与三条导入入口完全共用，Bug B 场景已会被记录为 `stage:"figure"` 的 generation learning 事件 | ✅ 规则已对齐 |
| 6 | 命题失败时：保存可恢复草稿（`generationDraft.server.ts`）→ 记录学习事件（`recordGenerationLearningIssuesSync`）→ 带提示重试一次 → 命题队列里“处理已返回试卷”可免重新生成整卷 | 命题侧已有，导入侧**没有** |
| 7 | 导入（三条入口共用 `runImportDocumentAiGeneration` + `buildImportedExamSnapshotFromAiParsed`）：**只调用模型一次**；内容级校验（`assertParsedQuestionsComplete`）失败直接 `throw`，无重试、无学习记录、无草稿保存 | ❌ 产品缺口 |
| 8 | 「网上导入队列」（目录 / URL 导入）已有状态、失败原因（表格内截断展示）、重新排队、释放卡住任务、清除记录，接近命题队列水平，但**没有“查看完整失败详情”弹窗、没有草稿恢复入口** | ⚠️ 部分缺口 |
| 9 | 「导入线下卷」文件上传对话框（`ImportOfflineExamDialog`）**完全不进入任何队列**：失败只有一次性 toast（10 秒），关闭对话框或刷新页面后无法再查看失败原因，重试等于用户手动重新点击按钮（会重新调用 AI，抽取文本仅存在于当前对话框内存中） | ❌ 产品缺口（最大缺口） |
| 10 | 设置页“按学科选择模型”文案只写“命题未按学科覆盖时使用”，未提及导入同样生效 | ⚠️ 文案缺口（认知层面，非功能缺口） |

---

## 1. 范围内 / 非目标

### 范围内
1. 三条导入路径（文件上传 / 网上目录 / 网页 URL）的模型解析规则与生成试卷保持**同一套代码路径**，并把这一点转化为可回归验证的验收标准（防止未来改动悄悄分叉）。
2. 为「文件上传型线下导入」补齐任务化能力：可查看**导入失败结果与日志**、可对失败任务执行**重试 / 查看详情**等操作，达到与「网上导入队列」「命题队列」相近的可观测水平。
3. 补齐导入侧的**内容级校验失败重试**（不只是配图），并接入 generation learning 审计闭环（记录 issue、可复用已批准策略提示）。
4. 明确导入失败后的“恢复”策略：是否需要类似命题草稿的“模型已返回、仅入库前校验/配图失败”场景下的免重新调用模型恢复入口。
5. 设置页文案/说明的一致性修正（学科模型映射同时作用于生成与导入）。

### 非目标（本轮不做）
1. 不新增/替换任何具体模型或云厂商适配（禁止硬编码模型名，出现新的不兼容应继续走“用户提示 + 设置改模型”的通用路径，而不是代码里 special-case 某个模型 ID）。
2. 不改变现有“同一时间仅跑 1 条任务”的队列并发策略。
3. 不改变图片/PDF/Excel 文本抽取（`offlineDocumentExtract`）本身的准确率问题，只覆盖“抽取之后”的 AI 整理与入库环节。
4. 不重做“网上试卷目录”的数据来源/合规机制（`docs/remote-paper-catalog.md` 已有约定，不在本次范围）。
5. 不要求本轮必须做“文件上传导入”合入统一队列组件的 UI 重构细节（属于前端实现方案，由 `frontend-engineer` 承接），本 PRD 只定义行为验收标准。

---

## 2. 验收标准（可测、可勾选）

### AC-1　模型解析规则对齐（回归验证，防止未来分叉）
- [ ] 给定同一 `subjectId`，「生成试卷」与三条导入入口（文件上传 / 网上目录 / URL）在相同设置（`modelEntries` + `subjectModelEntryIds`）下，解析出的 `{mode, cloudModel|localModel, baseUrl}` 完全一致（可用单元测试断言 `resolveEffectiveAiRuntime` 的调用参数/返回值，覆盖：无学科映射走默认、有学科映射走专属条目、旧版 `localSubjectModels` 兼容路径）。
- [ ] 学科缺失或为空字符串时，三条导入入口都必须回退到同一个默认学科 id（当前 `IMPORT_DEFAULTS.subject`），且**不允许**出现“文件上传导入用 A 默认、网上导入用 B 默认”的分叉（当前代码一致，需补充测试锁定该行为，防止回归）。
- [ ] 学科归一化：目录/URL 导入若填入了不在 `CURRICULUM_SUBJECT_OPTIONS` 枚举内的自由 `subjectId`（如目录维护者手填了拼音或旧名），需明确产品口径——是“归一失败即报错阻断”还是“归一失败静默回退默认学科”。当前实现是后者（静默回退），需产品确认是否符合预期，或需要在导入前对目录 `subjectId` 做枚举校验（属于 `data/remote-paper-catalog.json` 维护规范，非本 PRD 强制项，仅需在文档中挑明）。

### AC-2　导入失败可观测（文件上传型「导入线下卷」）
- [ ] 每次点击「AI 识别并入库」的尝试（无论成功/失败）都会留下一条**持久化的任务记录**（本机浏览器存储即可，与「网上导入队列」同等持久化水平），包含：提交时间、学科/年级/难度等参数、状态（导入中/成功/失败/已取消）、失败时的**完整错误信息**（不是 toast 10 秒后消失）。
- [ ] 用户可以在关闭对话框、刷新页面后，仍能在某处（如复用/新增「线下导入队列」入口）**查看历史失败记录**及完整失败原因。
- [ ] 失败记录支持「重试」：重试时优先复用**本次已抽取的正文**（不要求用户重新选择文件），除非正文已过期/不可用需明确提示需要重新上传。
- [ ] 失败原因文案继续复用现有 `userFacingError.shared.ts` 的友好文案映射（如 Interactions API 不兼容 → 提示去设置换模型），保持与生成试卷一致的措辞。

### AC-3　导入失败可观测（网上导入队列，增量补齐）
- [ ] 失败任务在「网上导入队列」表格中点击状态徽标，可打开**完整失败详情弹窗**（对齐 `GenerationJobQueues.tsx` 里 `JobStatus` 组件的弹窗体验），而不只是表格内截断的一行文字。
- [ ] 保留现有「重新排队」「释放卡住任务」「清除已完成/失败记录」能力（已实现，仅需在验收清单中确认不回归）。

### AC-4　导入内容校验失败的重试与学习闭环
- [ ] 导入路径在 `assertParsedQuestionsComplete`（或后续校验）失败时，**不再是直接整卷拒绝保存**，而是：记录一次 `outcome: "observed"` 的 generation learning 事件（`stage: "exam"`，`subject` 为该次导入学科）→ 基于失败原因生成重试提示（复用 `buildRetryQualityHintsFromIssues` 同款机制）→ 带提示重跑一次模型整理 → 仍失败才最终报错，并记录 `outcome: "failed"` 事件。
- [ ] 上述重试次数固定为 1 次（与命题生成一致），不引入无限重试循环（防止成本失控）。
- [ ] 配图硬闸门失败（Bug B 场景）已经会被记录为学习事件（现状已实现），验收时只需确认：导入失败后用户能在失败详情里看到“配图未通过”的具体题号与原因（当前 `finalizeExamQuestionFiguresHardGate` 的错误信息已包含该信息，需确认这段信息会透传到 AC-2/AC-3 的失败详情展示，而不是被上层 catch 吞掉或截断)。

### AC-5　导入失败恢复（是否需要“草稿恢复”对齐命题）— 需产品决策后定验收口径
- [ ] 【待决策】是否要求：当模型已成功返回 `submit_exam`，但**仅**因入库前校验/配图失败而拒绝保存时，导入侧也提供“处理已返回结果”的恢复入口（对齐命题 `recoveryDraftId` + “处理已返回试卷”），避免用户重新付费/重新等待模型整卷输出。
  - 若决策为「是」：需要导入路径也接入 `generationDraft.server.ts`（保存 `model_returned` / `validation_failed` 阶段草稿），并在导入失败任务上暴露对应恢复按钮。
  - 若决策为「否」（本轮先不做，用 AC-2 的“复用已抽取正文重试”缓解）：需在文档里明确说明该限制，避免后续被当作“漏做”。

### AC-6　设置页文案一致性
- [ ] 「按学科选择模型」说明文案从“命题未按学科覆盖时使用”更新为同时说明对导入生效的措辞（如“命题与导入线下卷未按学科覆盖时使用”），避免用户误以为要单独为导入配置模型。
- [ ] `ImportOfflineExamDialog` 的说明文案（当前已写“按下方所选学科使用『设置』中对应模型整理为试卷”）与设置页文案术语一致（同用“按学科选择模型”这一名词，不要出现两套叫法）。

---

## 3. 用户可见行为（导入页 / 设置页 / 失败结果与日志）

### 导入线下卷页（`/offline-imports`）
- 「导入线下卷」对话框（文件上传）：
  - 提交后若失败：除现有 toast 外，页面顶部/侧边新增（或复用现有「网上导入队列」组件扩展为「线下导入队列」）一个可查看的**失败任务列表**，与网上导入队列样式一致（状态徽标 + 操作列）。
  - 失败任务行可点击查看**完整**失败原因（含 AI 原始报错的可展开详情，与命题队列 `JobStatus` 弹窗一致的“摘要 + 详细信息可展开”结构）。
  - 失败任务提供「重试」按钮：复用已抽取正文，重新走一次导入（学科/年级/难度等参数保持上次选择，允许用户改动后再重试）。
- 「网上导入队列」（目录 / URL 导入）：
  - 保留现状（状态、重新排队、释放卡住、清除记录），新增“点击状态徽标查看完整失败详情”弹窗。

### 设置页（模型与接口 / 按学科选择模型）
- 顶部说明文案更新为同时覆盖“命题”与“导入线下卷”。
- （可选，视决策）在“按学科选择模型”弹窗里补一句：“该配置同时用于生成试卷与导入线下卷”。

### 失败结果 / 日志
- 无论文件上传导入、目录导入、URL 导入，失败记录的最小信息集须包含：失败时间、失败阶段（AI 未返回结构化结果 / 内容校验未通过 / 配图未通过 / 入库失败）、面向用户的友好文案（复用 `toUserFacingErrorMessage`）、可展开的原始错误详情。
- 失败阶段建议直接复用 `LearningIssueCode` 的分类语义（`generation.parse.failed` / `figure.scene.invalid` 等）做内部标记，但**面向用户展示的仍是友好文案**，不直接暴露内部 issue code。

---

## 4. 风险与依赖

| 风险/依赖 | 说明 | 建议处理 |
|---|---|---|
| 成本风险 | 导入侧一旦引入“校验失败重试一次”，会使部分导入任务的 AI 调用量翻倍（与命题现状一致） | 与命题保持同样的“固定重试 1 次”上限，不做无限重试；在失败详情里如实展示已重试过 |
| 数据存储位置 | 「网上导入队列」「命题队列」目前都是**浏览器本机存储**（换设备/清缓存会丢失）；若“文件上传导入”也走同样机制，需向用户说明其局限（与现有队列一致的免责声明） | 复用现有 `SheetDescription` 里的措辞模式（“任务记录保存在当前浏览器…”） |
| 草稿恢复的服务端依赖 | 若 AC-5 决策为“是”，需要导入路径接入 `generationDraft.server.ts`（服务端本机文件存储 `data/generation-drafts/`），在多实例部署/无持久磁盘环境下（如某些容器化部署）草稿可能跨请求丢失 | 沿用命题现有的已知限制，不在本轮新增风险，只需文档提示 |
| 学科归一化边界 | 网上试卷目录 `subjectId` 由人工维护 `data/remote-paper-catalog.json`，不受前端下拉框约束，可能填入枚举外的值 | 建议在目录校验（`docs/remote-paper-catalog.md` 相关校验脚本）阶段加白名单检查，而不是在导入时静默兜底，需产品/数据维护角色确认 |
| 与「学科模型映射」语义耦合 | 若默认学科兜底策略从“静默转 math”改成“阻断要求用户选学科”，会改变现有三条导入入口的行为，需要评估是否是破坏性变更（可能导致过去“可以不填学科就导入”的历史用法失败） | 需要产品明确：这是「体验优化」还是「防呆强制」，若强制需要提供迁移期提示 |
| 与配图审校流程的耦合 | Bug B 类问题即使加了重试，仍可能因为模型持续给出无效 `viewBox` 而最终失败；这不是「导入闭环」能完全兜底的问题，属于配图生成能力本身 | 保持“最终仍可失败，但失败要可见、可重试、有迹可查”的产品目标，不承诺“一定能导入成功”，只承诺“失败可诊断、可操作” |

---

## 5. 与现有「命题队列 / 网上导入队列 / generation learning」的关系：复用还是新实体？

**结论：复用现有实体，不建议新增平行系统。**

1. **模型解析规则**：不是新实体，是既有的 `resolveEffectiveAiRuntime` + `subjectId` 机制，导入侧已经在用。本 PRD 只要求补充回归测试锁定这一事实，不引入新代码路径。
2. **generation learning（可审计学习层）**：复用现有 `LearningScope`（`stage: "exam" | "figure"` + `subject` + `pack`）与 `recordGenerationLearningIssuesSync` / `buildActiveGenerationLearningHintsSync`。导入侧目前只在 `stage:"figure"` 有记录，需要补的是让 `stage:"exam"`（内容校验）也在导入路径调用同一套函数，而不是发明新的学习模型。
3. **任务队列 UI**：
   - 「网上导入队列」（`RemoteImportJob` / `remoteImportJobsStorage.ts`）与「命题队列」（`PaperGenJob` / `generationJobsStorage.ts`）当前是**两套并行但结构相似**的存储与组件（各自的 `GenJobStatus` 类型、各自的 localStorage key、各自的 Sheet 组件）。
   - 建议：**文件上传型「导入线下卷」新增的任务化能力，优先扩展/复用「网上导入队列」这套基础设施**（同样是“导入”语义，字段结构已经很接近：`title/year/gradeLabel/subjectLabel/status/errorMessage/examId`），而不是再造一个第三套队列存储；或者把「网上导入队列」改名/扩展为「线下导入队列」统一承载三条导入入口的任务记录。
   - 是否要与「命题队列」合并成一套通用组件（因为两者 UI 结构几乎一致：状态徽标、失败详情弹窗、重试、释放卡住、清除记录），属于前端实现方案选择，建议由 `frontend-engineer` / `software-architect` 在实现阶段评估“抽公共组件”的成本收益，本 PRD 不强制。
4. **草稿恢复（`generationDraft.server.ts`）**：若 AC-5 决策为需要，应直接复用该服务端模块（新增 `phase` 或复用现有 `phase` 枚举），不新增另一套草稿存储格式。

---

## 6. 与用户结论的对应关系（收口用）

| 用户结论 | 判定 | 依据 |
|---|---|---|
| 结论1：导入模型须与生成试卷同一套解析规则一致 | **规则对齐（已实现）**，需补回归测试固化 + 设置页文案更新 | 第 0 节第 1-4 条 |
| 结论1：设置里可按学科配置模型，同时覆盖生成与导入 | **规则对齐（已实现）**，需补文案说明 | 第 0 节第 2、10 条 |
| 结论1：禁止漏传学科落到不兼容默认模型 | **规则已有兜底（回退默认学科），但兜底策略是否符合预期需产品确认** | 第 0 节第 3 条、AC-1 第 3 条 |
| 结论2：导入支持反复导入/重试 | **网上导入队列已支持；文件上传导入不支持，为最大产品缺口** | 第 0 节第 8、9 条 |
| 结论2：导入对应审计学习闭环 | **配图级已对齐；内容级校验缺失重试与学习记录，为产品缺口** | 第 0 节第 6、7 条，AC-4 |
| 结论2：导入失败结果可查看失败日志，可做失败操作 | **网上导入队列部分满足（表格内截断展示 + 重试）；文件上传导入完全不满足** | 第 0 节第 8、9 条，AC-2/AC-3 |

---

## 7. 建议下一步

1. 请用户 / 项目经理对 **AC-1 第 3 条（学科兜底策略）** 与 **AC-5（是否需要草稿恢复）** 两处「待决策」项给出明确选择。
2. 决策确认后，由 `project-manager` 拆解为里程碑（建议顺序：① 回归测试固化规则对齐 → ② 文件上传导入接入任务队列（可观测+重试） → ③ 内容级校验重试 + 学习闭环 → ④（视决策）草稿恢复 → ⑤ 文案统一）。
3. 实现阶段涉及前端队列组件时，按仓库规则需要 `frontend_exec_confirm` 确认改动范围后再动前端大范围 UI。

（文档路径：`docs/prd-offline-import-parity.md`；未发现同名或同主题既有 PRD，`docs/prd-math-function-m2.md` / `docs/prd-math-function-m3.md` 为函数题图专题，与本文档主题不重叠，故新建此文件是合适的。）

---

## 8. 补充：导入忠实转录（2026-07-19）

真实案例：导入原卷「直角△AOB，B(5√3,0)，等边△DEF，(Ⅰ)(Ⅱ)①②」被整理成「等腰直角△AOB，B(5,0)，等腰直角△DEF，(1)(2)(3)(4)」——根因是导入复用了**命题人设** system prompt，其中「具体数值、情境必须重新设计」条款引导模型改题。已修复：

1. **导入专用 `IMPORT_TRANSCRIBE_SYSTEM_PROMPT`**（`exam-generation.server.ts`）：身份为「试卷数字化转录校对员」；照录数值/根式/图形类型/小问编号/填空线，禁止改良；与命题共享同一份 submit_exam 格式契约常量（`SUBMIT_EXAM_*`），避免两份提示词漂移。
2. **一题多图**：转录约定每幅原图（图①/图②）各一个 attachments 项；`figureGeneration.server.ts` 新增多图逐一渲染路径（全部 scene 可校验时生效，禁止合并/丢图）。
3. **填空线渲染**：`sanitizeExamMathDisplay` 不再把 `$\underline{\quad\quad}$` 掏空成不可见；整段空位转明文 `________`，嵌在公式内的空位转 KaTeX `\rule` 水平线（对已入库试卷立即生效，因清理在展示层）。

## 9. 导入保真升级（原图优先 + Docling Sidecar，2026-07-19）

原则：**原始图像是事实来源**；OCR/AI 是可审计派生；禁止用重绘 SVG 覆盖原图。

| 能力 | 落点 |
|------|------|
| 来源资产版本化 | `data/imports/<documentId>/`（`bundle.json`、页图、裁剪、`review.json`）；`public/imports/` 可展示 |
| Docling Sidecar | `tools/document-parser/`；`npm run doc-parser`；`MPG_DOC_PARSER_URL`；不可用时 `quality=basic_fallback` 并 UI 提示 |
| 逐题组装 | `importQuestionAssemble.shared.ts`（阅读顺序，非题号硬编码） |
| 保真闸门 | `importFaithfulness.shared.ts` → findings；未解决 blocker 阻断「确认入库」 |
| 双轨题图 | `role=source_figure` 默认展示；`derived_diagram` 可选；`QuestionAttachments` 可切换 |
| 审核工作台 | `/offline-imports` 待确认卷 →「保真审核」；可标记已解决 / 锁定字段 |
| 黄金集 | `examples/v1/import-fidelity/` + `importFidelityGolden.test.ts` |

Electron / DMG：Sidecar 为**可选本机服务**（不打进安装包模型权重）；首次需本机 `npm run doc-parser:install` 下载 Docling 依赖。未启动时导入仍可用浏览器 OCR，但质量标记为 `basic_fallback`。缓存路径建议使用用户目录下的 Docling 默认 cache，勿写入 app.asar。
