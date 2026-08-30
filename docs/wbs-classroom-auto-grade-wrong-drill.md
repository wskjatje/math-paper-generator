# WBS：课堂提交即时阅卷、教师错题看板、按错题生成巩固卷

> **范围冻结依据**：[prd-classroom-auto-grade-wrong-drill.md](./prd-classroom-auto-grade-wrong-drill.md)  
> **拍板覆盖（2026-07-25，已确认）**：
> 1. **主观题也计分**：禁止 AI 语义猜分；须确定性规范化字符串全等；双方可解析为数值时用**可配置容差**；无标答或不可确定性比对 → `ungraded`（不记错、不计分）。
> 2. **巩固卷双能力**：① 同题型新题（整卷 composition）；② 以错题为种子做变式（走命题管线，非原文拷贝）。
> 3. **提交后不可改交**（保持唯一提交约束）。
> 4. **CSV / 班级正确率图表** → M4+ 推迟。
> 5. **填空/计算**：规范化字符串全等 **与** 可配置数值容差 **均须**（先规范化，再尝试数值比对）。
> **关联代码（只读对齐，勿扩大范围）**：
> `src/lib/classroom.functions.server.ts` · `src/routes/student.tsx` · `src/routes/teacher.tsx` · `src/lib/studentAnswers.shared.ts` · `src/lib/stripExamAnswersForStudent.shared.ts` · `src/components/student/StudentQuestionAnswer.tsx` · `src/routes/generate.tsx` · `src/lib/generateCatalog.ts` · `src/lib/generationJobsStorage.ts` · `src/lib/generationJobs.types.ts` · `src/lib/exam-generation.server.ts` · `src/lib/exam.functions.server.ts`（`generateExamplesForExistingExam`）· `src/components/generation/GenerationJobQueues.tsx` · `data/classroom-assignments.json` · Supabase `classroom_assignments` / `classroom_submissions`
> **状态**：排期草案 · 2026-07-25

---

## 0. 范围冻结前提

本 WBS 以 PRD 全文 + 上文「拍板覆盖」为唯一范围来源。下列事项**不在 M1–M3 内**：

- AI 主观语义阅卷；题号 / 试卷 ID / 学生名硬编码分支；错题原文拼卷不经命题管线。
- 班级实体 / 名册升级；RLS 收紧；截止时间服务端硬拒（可并行安全债 Issue）。
- `examAnswerVerification.server.ts` 直接当学生阅卷（该模块面向 AI 入库验算，语义不同）。
- M4+：CSV 导出、班级正确率图表、改交、跨学期错题本、教师手批覆盖分。

**会话隔离建议**：M1（阅卷引擎）、M2（教师看板）、M3（巩固卷双入口）宜分 Chat/分支或 worktree，审计以 PR + 本 WBS 任务 ID 追溯。

---

## 1. 项目周期（待确认）

| 里程碑 | 计划窗口（人日估算） | 说明 |
|--------|----------------------|------|
| **M1** 阅卷引擎 + 提交写回 + 学生结果 | 5～7 人日 | 阻塞 M2、M3 |
| **M2** 教师错题看板 | 3～4 人日 | 依赖 M1 |
| **M3** 错题聚合 + 巩固卷双入口 | 6～9 人日 | 依赖 M1；M3-B 变式可与 M3-A 部分并行 |
| **M4+**（推迟） | — | 见 §6 |

**总工期估算（待确认）**：约 **14～20 人日**（含 QA 收口）；未含 Code Review 往返、`frontend_exec_confirm` 与 Supabase 迁移部署窗口。具体起止日期待用户确认可用人力后标注。

---

## 2. 里程碑总览

| 里程碑 | 交付摘要 | 挂钩 PRD AC | 建议主责 Agent |
|--------|----------|-------------|----------------|
| **M1** | shared 确定性阅卷 + `grade_result` 持久化 + 提交同步判分 + 学生结果 UI + 再访只读 | AC-S1～S6、AC-Q1～Q3 | backend-engineer → frontend-engineer → qa-engineer |
| **M2** | 教师列表分数/错题 + 展开错题对比；弱化全文瀑布 | AC-T1～T2 | frontend-engineer → qa-engineer |
| **M3** | 错题聚合 → composition 预览/入队；**同题型新题** + **变式卷** 双入口；可发布新作业 | AC-D1～D4、AC-T3、AC-Q2 | backend-engineer → frontend-engineer → qa-engineer |
| **M4+** | CSV、图表、改交、错题本、教师手批 | — | 另 PRD |

---

## 3. 依赖顺序

```
M1-A 类型与纯函数判分（shared + 单测）
  │
M1-B submit 集成 + grade_result 存储（本地 JSON + Supabase）
  │
M1-C 学生提交结果 UI + 再访只读（getMySubmission）
  │
  ├──────────────────┐
  ▼                  ▼
M2 教师看板      M3-A 错题聚合 + 同题型新题（composition → /generate 队列）
                       │
                       ▼
                 M3-B 变式卷（错题种子 → exam-generation 扩展）
                       │
                       ▼
                 M3-C 教师双入口 UI + 发布新作业 + 验收收口
```

**硬依赖**：M1-B 依赖 M1-A；M1-C 依赖 M1-B；M2 / M3-A 依赖 M1-C（至少 `grade_result` 可读）；M3-B 依赖 M3-A 的聚合逻辑；M3-C 依赖 M3-A 与 M3-B 的 ServerFn 契约。

**软依赖**：M2 与 M3-A 可在 M1-C 完成后并行（不同文件域）。

---

## 4. M1：阅卷引擎 + 提交写回 + 学生结果

### M1-W1 · 阅卷契约与配置（shared）

| 项 | 内容 |
|----|------|
| **目标** | 定义 `SubmissionGradeResult` / `QuestionGrade` / `GradeVerdict` 类型与 `grade_result` schema version；填空数值容差、composition 上限等写入**可配置常量**（非题号特判）。 |
| **依赖** | 无 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | 新模块建议路径：`src/lib/classroomGrade.shared.ts`（类型 + 配置导出）；必要时扩展 `src/lib/studentAnswers.shared.ts` 的题型辅助函数。 |
| **DoD** | 字段语义与 PRD §4.1 一致；本地 JSON 与 Supabase JSONB 共用同一 TypeScript 类型；容差为单一配置项（相对/绝对，文档化默认值）。 |
| **风险** | 类型散落多处 → 缓解：仅 shared 导出，server/UI 只 import shared。 |
| **验收 AC** | AC-Q3（schema 一致） |

---

### M1-W2 · 确定性阅卷纯函数

| 项 | 内容 |
|----|------|
| **目标** | 实现 `gradeQuestion(question, studentValue)` / `gradeSubmission(questions, answerPayload)`：单选、多选（集合相等、忽略顺序）、填空/计算（trim/全半角/空白折叠 + 可选去 `$`/`\\` 外层 → 字符串全等；双方可解析数值时再比容差）、主观/解答/证明/作文（规范化字符串全等；失败则 `ungraded`，**禁止** AI）。 |
| **依赖** | M1-W1 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | `src/lib/classroomGrade.shared.ts`（纯函数）；`src/lib/classroomGrade.shared.test.ts` |
| **DoD** | 无 `exam_id`、题号、学生名分支；无标答/空标答 → `ungraded`；`score = Σ earnedPoints`，`maxScore = Σ 可判题 points`；单测覆盖 PRD AC-Q1 所列场景 + 数值容差边界 + 主观规范化全等 + 无法比对 → ungraded。 |
| **风险** | 库内 `answer` 格式不统一（字母 vs 全文）→ 解析失败一律 `ungraded` 并留结构化日志位（不猜测）。 |
| **验收 AC** | AC-S1～S4、AC-Q1 |

---

### M1-W3 · 提交链路集成与持久化

| 项 | 内容 |
|----|------|
| **目标** | `submitClassroomAssignment`（`classroom.functions.server.ts`）在持久化 `answer_payload` 后**同步**阅卷 → 写入 `grade_result` → 响应返回 `{ ok, gradeResult }`；保持现有唯一提交约束（D7）。 |
| **依赖** | M1-W2；需加载作业关联试卷题目（`getExamDetail` / 现有 exam 读取路径） |
| **建议 Agent** | **backend-engineer** |
| **交付物** | 修改 `src/lib/classroom.functions.server.ts`；`ClassroomSubmission` 类型增加 `grade_result?`；Supabase migration 为 `classroom_submissions.grade_result jsonb`；本地 `data/classroom-assignments.json`  submissions 同字段。 |
| **DoD** | 双轨（Supabase + 本地 JSON）写入同一 schema；重复提交仍抛现有错误文案；**权威分在服务端**；不调用 `examAnswerVerification.server.ts`。 |
| **风险** | SSR 下 exam 读取失败 → 提交应失败并明确错误，不得静默无分。 |
| **验收 AC** | AC-S6、AC-Q3 |

---

### M1-W4 · 学生再访只读与标答授权

| 项 | 内容 |
|----|------|
| **目标** | 新增 ServerFn（如 `getMyClassroomSubmission`）或扩展 `getClassroomAssignment`：已提交学生可读取自己的 `grade_result`；**仅错题**在结果中带 `correctAnswer`；未提交前 loader 仍走 `stripExamAnswersForStudent.shared.ts`（AC-S5 回归）。 |
| **依赖** | M1-W3 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | `classroom.functions.server.ts` 新查询；授权：`assertStudentAccess` + assignment/student 匹配。 |
| **DoD** | 未提交学生拿不到标答；其他学生拿不到他人 `grade_result`。 |
| **风险** | Supabase RLS 偏松 → 标答仅经 ServerFn 返回，不新增匿名可读接口（PRD §7）。 |
| **验收 AC** | AC-S5、AC-S6 |

---

### M1-W5 · 学生端结果 UI

| 项 | 内容 |
|----|------|
| **目标** | `src/routes/student.tsx`：提交成功后展示总分（得分/可判满分）、未判题计数、错题列表（题号、题干摘要、你的答案、正确答案）；已提交再进入 → 只读结果区，禁用 `StudentQuestionAnswer` 编辑与提交按钮。 |
| **依赖** | M1-W3、M1-W4 |
| **建议 Agent** | **frontend-engineer** |
| **交付物** | 修改 `student.tsx`；可抽 `src/components/student/SubmissionGradeSummary.tsx`（可选，非必须）。 |
| **DoD** | 文案区分「本版未自动阅卷」(`ungraded`)；作对题不默认展示完整解析；与 `submitClassroomAssignment` 返回或再访 API 一致。 |
| **风险** | 仅客户端 `submitted` state 刷新丢失 → loader 须识别已提交并拉取 `grade_result`。 |
| **验收 AC** | AC-S1～S6 |

---

### M1-W6 · M1 集成测试收口

| 项 | 内容 |
|----|------|
| **目标** | 本地 JSON 路径至少一条集成测：提交 → 持久化 `grade_result` → 再访只读；`make validate` / 相关 test 通过。 |
| **依赖** | M1-W5 |
| **建议 Agent** | **qa-engineer** |
| **DoD** | AC-Q1～Q3 在 M1 范围内全部可勾选；Code Review 确认无硬编码分支（AC-Q2）。 |

---

## 5. M2：教师错题看板

### M2-W1 · 列表 API 扩展

| 项 | 内容 |
|----|------|
| **目标** | `listClassroomSubmissions` 返回每条提交的 `grade_result` 摘要（`score`、`maxScore`、`wrongQuestionIds`、必要时的逐题 `QuestionGrade`）；无提交记录者不返回伪分数。 |
| **依赖** | M1-W3 |
| **建议 Agent** | **backend-engineer** |
| **DoD** | 仅作业发布者可查看；旧提交无 `grade_result` 时显式标记「待重算/无阅卷」或迁移脚本说明（若需一次性 backfill 另开任务，本版可仅对新提交保证）。 |
| **验收 AC** | AC-T1、AC-T2 |

---

### M2-W2 · 教师列表与错题展开 UI

| 项 | 内容 |
|----|------|
| **目标** | `src/routes/teacher.tsx`：`SubmissionList` 改为主列 **学生标识 | 提交时间 | 分数 | 错题题号**；展开行显示错题题干摘要 + 学生答案 vs 标答；「展开逐题答案」降为次级 `details`（P1 可选保留）。 |
| **依赖** | M2-W1；现有 `questionLabelByExam` 题干摘要逻辑 |
| **建议 Agent** | **frontend-engineer** |
| **DoD** | 无需翻阅全文即可知分数与错题；未提交学生不出现在列表或不出现在「已交」分视图（与现行为一致）。 |
| **风险** | 大班级列表性能 → 先沿用现有一次加载；分页非本版范围。 |
| **验收 AC** | AC-T1、AC-T2 |

---

### M2-W3 · M2 验收

| 项 | 内容 |
|----|------|
| **目标** | 手测或 e2e：两生提交（一对错）后教师视图正确；AC-T1～T2 勾选。 |
| **依赖** | M2-W2 |
| **建议 Agent** | **qa-engineer** |

---

## 6. M3：错题聚合 → 巩固卷（双入口）

> **产品区分（须 UI 文案锁死）**  
> - **同题型新题**：按错题题型统计 → 预填 `/generate` composition → 全新 AI 命题整卷（接近 PRD D9–D10，产出新 `exam_id`）。  
> - **变式卷**：以具体错题 `Question` 为种子 → 扩展 `exam-generation.server.ts` 既有例题/变式生成能力（参考 `generateExamplesForQuestionSet` / `runExampleGenerationForReps`），**不得**拷贝错题 `content` 原文；产出仍为完整新卷或可发布试卷包。

### M3-W1 · 班级错题聚合（shared + server）

| 项 | 内容 |
|----|------|
| **目标** | 纯函数：输入某作业全部已提交 `grade_result`，输出 `wrongCountByType`、错题 `questionId` 列表、参与学生数；composition 映射 `count(type) = clamp(ceil(wrongCountByType[type] / studentSubmitCount * k), 1, typeCap)`（`k`、`typeCap`、总上限来自 M1-W1 配置）。 |
| **依赖** | M1-W3 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | `src/lib/wrongDrillComposition.shared.ts` + `.test.ts`（名称以实现为准，逻辑放 shared） |
| **DoD** | PRD §3.3 规则可单测锁表；`wrongCount=0` 的类型不进 composition；全对班级聚合为空。 |
| **验收 AC** | AC-D1、AC-D4 |

---

### M3-W2 · 预览 ServerFn

| 项 | 内容 |
|----|------|
| **目标** | `previewWrongDrillComposition(assignmentId)`：返回各题型错题人次、将生成的 composition 草稿、原卷 `subject`/`grade`（从 `assignment.exam_id` → exam metadata）；零提交 / 无错题时返回不可用原因。 |
| **依赖** | M3-W1；`getExamDetail` |
| **建议 Agent** | **backend-engineer** |
| **交付物** | `classroom.functions.server.ts` 或同级 server 模块 |
| **DoD** | 教师授权；零提交时 AC-T3 文案就绪。 |
| **验收 AC** | AC-T3、AC-D1、AC-D4 |

---

### M3-W3 · 入口 A：同题型新题 → 命题队列

| 项 | 内容 |
|----|------|
| **目标** | `enqueueWrongDrillGeneration(assignmentId, { mode: "fresh_by_type", overrides? })`：将 M3-W1 composition + 学科年级写入 `PaperGenPayloadSnapshot`，经 `upsertPaperJob`（`generationJobsStorage.ts`）入队；`/generate` 通过既有 `consumePaperPrefillPayload` / `PAPER_PREFILL_APPLY_EVENT` 预填；生成走 `exam-generation.server.ts` 整卷管线。 |
| **依赖** | M3-W2；`src/routes/generate.tsx`、`GenerationJobQueueRunner` |
| **建议 Agent** | **backend-engineer** + **frontend-engineer**（跳转/预填确认） |
| **DoD** | 生成任务可在 `GenerationJobQueues.tsx` 观测状态/失败；新卷题目文本 ≠ 错题原文（AC-D3 抽检）；失败可重试对齐现有命题队列体验。 |
| **风险** | 学科/年级缺失 → 弹窗必填后再入队（PRD §3.3.4）；AI 成本 → 必须经预览确认。 |
| **验收 AC** | AC-D2、AC-D3 |

---

### M3-W4 · 入口 B：变式卷（错题种子）

| 项 | 内容 |
|----|------|
| **目标** | `enqueueWrongDrillGeneration(assignmentId, { mode: "variant_from_wrong", seedQuestionIds?, overrides? })`：从聚合错题中选取代表题（可按题型 cap 去重）作为 **seed**；扩展 `exam-generation.server.ts`（或 `exam.functions.server.ts` 新 ServerFn）在命题 prompt/契约中传入 seed 题干与 metadata，生成**变式新题**并组装为新试卷；禁止 seed 文本原样入卷。 |
| **依赖** | M3-W1；现有 `generateExamplesForExistingExam` / `generateExamplesForQuestionSet` 行为对齐（**产品文案**区分「巩固卷·变式」与「例题」） |
| **建议 Agent** | **backend-engineer** |
| **DoD** | 变式卷与新题卷均为新 `exam_id`；seed 列表可审计（写入 job payload）；单测或集成测：输出题面与 seed `content` 非逐字相等。 |
| **风险** | 与 `generateExamplesForExistingExam` 职责重叠 → 复用底层 `runExampleGenerationForReps` 类路径，上层的整卷组装与 UI 入口独立；避免旁路写死题面。 |
| **验收 AC** | AC-D2、AC-D3 |

---

### M3-W5 · 教师端双入口 UI + 发布新作业

| 项 | 内容 |
|----|------|
| **目标** | `teacher.tsx` 作业级操作：**根据错题生成巩固卷** → 预览对话框（错题人次 + composition / seed 摘要）→ 二选一或分按钮：「同题型新题」「错题变式卷」→ 确认入队 → 完成后引导「发布为新作业」（复用 `createClassroomAssignment` + 新 `exam_id`）。 |
| **依赖** | M3-W3、M3-W4 |
| **建议 Agent** | **frontend-engineer** |
| **DoD** | 全对 / 零提交按钮 disabled + 原因提示；生成中状态与 `GenerationJobQueues` 一致；文案不与「例题生成」混淆。 |
| **验收 AC** | AC-T3、AC-D1～D4 |

---

### M3-W6 · M3 验收与纪律检查

| 项 | 内容 |
|----|------|
| **目标** | 场景：两人同错填空、一人错单选 → 预览 composition 符合单测表；双入口各生成一卷；`npm test` 相关用例绿。 |
| **依赖** | M3-W5 |
| **建议 Agent** | **qa-engineer** |
| **DoD** | AC-D1～D4、AC-Q2 全部可勾选；Issue/PR 摘要链接本 WBS。 |

---

## 7. M4+（推迟，另 PRD / Issue）

| 项 | 说明 | 建议 Agent |
|----|------|------------|
| CSV 导出 | 作业成绩/错题导出 | backend-engineer + frontend-engineer |
| 班级正确率图表 | 可视化统计 | frontend-engineer |
| 改交 | 打破唯一提交约束 | backend-engineer |
| 教师手批 | 覆盖 `ungraded`/主观分 | backend-engineer + frontend-engineer |
| 跨学期错题本 | 学生自主复习 | product-manager → 另 PRD |

---

## 8. 跨里程碑风险登记

| 风险 | 影响 | 缓解 | 关联任务 |
|------|------|------|----------|
| 标答格式不统一 | 误 ungraded 或漏判 | 判分层只认可解析形态；日志/learning 供清洗 | M1-W2 |
| 双轨存储漂移 | 本地与云端分不一致 | 同一 shared 类型 + M1-W6 集成测 | M1-W3、M1-W6 |
| 巩固卷 AI 成本 | 全班一键多卷 | 预览确认；队列重试上限与现命题一致 | M3-W3、M3-W4 |
| 变式 vs 例题混淆 | 用户误操作 | 教师 UI 文案 + 不同 job type/payload | M3-W4、M3-W5 |
| 前端大范围改动 | 回归 student/teacher | 分里程碑 PR；`frontend_exec_confirm` | M1-W5、M2-W2、M3-W5 |
| 旧提交无 grade_result | 教师看板空分 | 文档说明仅新提交；可选 backfill 脚本另任务 | M2-W1 |

---

## 9. 验收标准映射（DoD 汇总）

| PRD AC | 主责里程碑 / 任务 |
|--------|-------------------|
| AC-S1～S3 | M1-W2、M1-W5 |
| AC-S4 | M1-W2（主观：规范化全等或 ungraded，非 AI 猜错） |
| AC-S5 | M1-W4、M1-W5 |
| AC-S6 | M1-W3、M1-W4、M1-W5 |
| AC-T1～T2 | M2-W1、M2-W2 |
| AC-T3 | M3-W2、M3-W5 |
| AC-D1 | M3-W1、M3-W6 |
| AC-D2 | M3-W3、M3-W4 |
| AC-D3 | M3-W3、M3-W4、M3-W6 |
| AC-D4 | M3-W1、M3-W5 |
| AC-Q1 | M1-W2、M1-W6 |
| AC-Q2 | M1-W6、M3-W6 + Code Review |
| AC-Q3 | M1-W3、M1-W6 |

---

## 10. 建议 PR / 分支切分

| PR | 范围 | 合并门槛 |
|----|------|----------|
| PR-1 | M1（W1～W6） | 阅卷单测 + 本地提交集成测 + 学生 UI |
| PR-2 | M2（W1～W3） | 教师看板手测 + AC-T1～T2 |
| PR-3 | M3-A（W1～W3） | 同题型新题 + composition 单测 |
| PR-4 | M3-B（W4～W6） | 变式卷 + 双入口 UI + AC-D* |

PR-3 与 PR-4 可顺序合并；若人力并行，PR-4 依赖 PR-3 的 M3-W1/W2 契约合并后再开变式分支。
