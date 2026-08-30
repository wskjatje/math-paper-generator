# PRD：课堂提交即时阅卷、教师错题看板、按错题生成巩固卷

- 状态：**已确认**（2026-07-25）
- 角色：产品经理收口；实现按 [wbs-classroom-auto-grade-wrong-drill.md](./wbs-classroom-auto-grade-wrong-drill.md) 拆里程碑
- 约束（硬）：
  - **不允许猜测**：禁止 AI「语义判对错」；无标答或双方均不可确定性比对时标记 `ungraded`，**不得伪造得分**
  - **不允许硬代码**：不得按题号/试卷 ID/固定答案分支特判；巩固卷须走现有命题管线，不得写死题目文本或把错题原文拼卷充数
- 关联代码（只读事实）：
  - 学生：`src/routes/student.tsx`、`src/lib/studentAnswers.shared.ts`、`StudentQuestionAnswer`
  - 教师：`src/routes/teacher.tsx`、`src/lib/classroom.functions.server.ts`
  - 存储：`classroom_assignments` / `classroom_submissions`（及本地 `data/classroom-assignments.json`）
  - 命题：`src/routes/generate.tsx`、`exam-generation.server.ts`、`generateExamplesForExistingExam`（同型例题参考，非错题卷本身）
  - 命题验算（**不可直接当阅卷**）：`examAnswerVerification.server.ts`

---

## 0. 结论先行（现状 vs 已确认目标）

| 用户诉求 | 现状（代码事实） | 已确认目标 |
|----------|------------------|------------|
| 学生提交后直接阅卷并给分 | 提交只存 `answer_payload`，无判分 | 提交事务内确定性阅卷并回显分数 |
| 错误题展示正确答案 | 学生端 `hide_answers` 脱敏 | 提交**之后**仅对错题揭示标答 |
| 教师只看分数与错题 | 仅看原文，无分数/对错 | 主视图：分数 + 错题；原文次级 |
| 按全班错题再生卷 | 无 | **双入口**：同题型新题 + 以错题为种子的变式卷 |

---

## 1. 范围内 / 非目标

### 1.1 范围内（已确认 MVP = WBS M1–M3）

1. **确定性自动阅卷（全题型计分口径）**  
   - 凡有非空标答的题目均参与计分尝试。  
   - 比对规则：**规范化字符串全等**；若双方均可解析为有限数字，则再按**可配置容差**判等（填空/计算/解答等凡适用均同此双轨，禁止按题硬编码容差）。  
   - 单选/多选：字母集合规则见 §2。  
   - 无标答、标答无法与学生答做确定性比对 → `ungraded`（不记错、该题分不计入 `maxScore`）。  
   - **禁止** AI 语义阅卷。

2. **学生提交后即时反馈**  
   总分、错题列表、错题正确答案；已有 `solution_steps` 可展示，**禁止**现场 AI 编解析。

3. **教师作业看板（精简）**  
   每生：分数 + 错题题号；展开：题干摘要 + 学生答 vs 标答。全文原文为次级入口。

4. **班级错题 → 巩固卷（双能力）**  
   - **入口 A · 同题型新题**：聚合错题 `type` → 预填 `/generate` composition → 命题队列出新卷。  
   - **入口 B · 错题变式**：以错题（题干/标答/题型/知识点标签若有）为种子，经现有 `exam-generation` 同类机制生成变式题组成新卷（参考 `generateExamplesForQuestionSet` 精神，**禁止原文拷贝充数**）。  
   - 生成后可发布为新作业。

5. **阅卷结果持久化**；提交后**不允许改交**（保持唯一约束）。

### 1.2 非目标（本轮不做 / 推迟）

1. AI 主观语义阅卷。  
2. 完整跨学期错题本、间隔复习。  
3. 班级实体 / 名册升级。  
4. RLS 收紧、作业 CRUD、截止服务端硬拒（并行安全债，不阻塞本 PRD）。  
5. 错题原文拼卷不经命题管线。  
6. **CSV 导出、班级正确率图表** → **M4+ 推迟**（已确认）。  
7. 改交、教师手批改分覆盖自动分 → M4+ / 另 PRD。

---

## 2. 已确认决策表

| # | 议题 | 已确认口径 |
|---|------|------------|
| D1 | 判分覆盖 | **所有题型均尝试计分**；规则为确定性比对，不是 AI |
| D2 | 总分 | `score = Σ(verdict=correct 的 points)`；`maxScore = Σ(非 ungraded 题的 points)`；`ungraded` 旁注「无标答/无法自动比对」 |
| D3 | 多选 | 规范化后集合相等（忽略顺序、去重、统一大写） |
| D4 | 填空/计算/可解析文本答 | **先**规范化字符串全等；**否则若**双方可解析为有限数字 → **可配置容差**数值相等；否则错（有标答时）或 ungraded（无标答） |
| D5 | 无标答 | `ungraded`，不记错、不计入 maxScore |
| D6 | 揭示标答 | 仅提交后、且仅错题展示正确答案；提交前继续脱敏 |
| D7 | 改交 | **禁止**；再访只读结果 |
| D8 | 教师主视图 | 分数 + 错题；原文次级 |
| D9 | 同题型新题题量 | 按错题题型统计映射 composition（配置化 cap，非题号特判） |
| D10 | 同题型新题路径 | 预填 `/generate` 命题队列 |
| D11 | 巩固卷双能力 | **A 同题型新题** + **B 以错题为种子变式**（均须交付） |
| D12 | 双轨存储 | shared 判分 + 同一 `grade_result` schema（本地 JSON / Supabase） |
| D13 | CSV/图表 | **本版推迟** |

### 主观题计分说明（避免误解）

「需要计分」= 解答/证明等**纳入满分与得分计算**，比对方式与填空相同：**规范化字符串全等，或可解析数值+容差**。  
学生表述与标答不等价但「意思对」→ 本版判**错**（展示标答），**不**用 AI 改判。教师手批改分属 M4+。

---

## 3. 用户可见行为

### 3.1 学生端

1. 作答中：不显示标答。  
2. 提交成功 → 结果区：`得分/满分`、错题（题号、题干摘要、你的答案、正确答案）、`ungraded` 题单独说明。  
3. 再访：只读结果，无提交按钮。

### 3.2 教师端

1. 列表：学生 | 时间 | 分数 | 错题题号。  
2. 展开：错题对比；完整作答次级。  
3. 作业级两个操作（可同预览面板分 Tab）：  
   - **生成同题型巩固卷**  
   - **生成错题变式卷**  
4. 零提交 / 无错题：入口禁用并说明原因。

### 3.3 巩固卷规则（确定性部分须单测）

**共同输入**：本作业全部提交中 `verdict === "wrong"` 的题目。

**入口 A（同题型新题）**  
1. `wrongCountByType` → composition（`clamp` + 总上限，配置化）。  
2. 带入可解析的学科/年级；缺失则教师补全后再入队。  
3. 禁止错题 `content` 写入新卷充数。

**入口 B（变式）**  
1. 以错题集合为种子（题干、题型、标答、knowledge_tags 若有）调用命题/例题管线扩展，生成等量或配置比例的变式题。  
2. 产出新 `exam_id`；题目文本不得与任一错题原文完全相同（抽检 + 生成侧约束）。  
3. 同样禁止硬编码题号分支。

---

## 4. 数据与接口（契约级）

### 4.1 `SubmissionGradeResult`（语义锁定）

```ts
type GradeVerdict = "correct" | "wrong" | "ungraded";

type QuestionGrade = {
  questionId: string;
  orderIndex: number;
  type: string;
  points: number;
  verdict: GradeVerdict;
  earnedPoints: number; // correct → points；wrong/ungraded → 0
  studentValue: string;
  correctAnswer?: string; // 仅 wrong 时对授权方展示
};

type SubmissionGradeResult = {
  version: 1;
  gradedAt: string;
  score: number;
  maxScore: number; // 非 ungraded 题 points 之和
  ungradedCount: number;
  questions: QuestionGrade[];
  wrongQuestionIds: string[];
};
```

### 4.2 服务端

- `submitClassroomAssignment`：存答案 → 同步阅卷 → 写 `grade_result` → 返回学生。  
- `listClassroomSubmissions`：分数 + 错题最小字段。  
- `previewWrongDrillComposition` / `enqueueWrongDrillGeneration`（同题型）。  
- `previewWrongVariantDrill` / `enqueueWrongVariantGeneration`（变式；名称以实现为准）。

### 4.3 禁止

- 客户端算分为权威。  
- 直接把 `examAnswerVerification` 当学生阅卷。  
- 按 `exam_id`/题号特判。

---

## 5. 验收标准（可测）

### AC-学生

- [ ] AC-S1 单选错：扣对应分，错题区有标答。  
- [ ] AC-S2 单选对：进总分，不进错题列表。  
- [ ] AC-S3 多选集合相同（顺序不同）→ 对。  
- [ ] AC-S4 解答题：标答非空时，规范化全等或数值容差内 → 得分；否则判错并显示标答（**不计 ungraded**，除非无标答）。  
- [ ] AC-S5 提交前不泄露 `answer`。  
- [ ] AC-S6 禁止改交；再访只读含 `grade_result`。  
- [ ] AC-S7 填空：仅规范化后字符串相同 → 对；或双方可解析数值且在配置容差内 → 对。

### AC-教师

- [ ] AC-T1 列表可见分数与错题题号。  
- [ ] AC-T2 未提交无伪分。  
- [ ] AC-T3 零提交时两巩固入口均不可用并提示。  
- [ ] AC-T4 无错题时巩固入口提示「暂无错题」。

### AC-巩固卷

- [ ] AC-D1 同题型：错题题型分布 → composition 预览符合规则（单测锁表）。  
- [ ] AC-D2 两入口任务均进现有/扩展命题队列，失败可观测。  
- [ ] AC-D3 新卷题目 ≠ 错题原文拷贝（抽检）。  
- [ ] AC-D4 变式入口：种子来自错题集合；生成参数可审计。  
- [ ] AC-D5 全对班级：两入口均提示暂无错题。

### AC-质量

- [ ] AC-Q1 阅卷纯函数单测：选择/多选/填空字符串/填空数值容差/空答/无标答/解答全等。  
- [ ] AC-Q2 无题号/试卷 ID/学生名硬编码分支。  
- [ ] AC-Q3 本地与云端 `grade_result` 语义一致。

---

## 6. 里程碑（与 WBS 对齐）

| 里程碑 | 交付 |
|--------|------|
| **M1** | 阅卷引擎 + 提交写回 + 学生结果只读 |
| **M2** | 教师分数/错题看板 |
| **M3** | 错题聚合 + **同题型新题** + **错题变式** + 可发布新作业 |
| **M4+** | CSV、正确率图、改交、手批、错题本（推迟） |

详见 [wbs-classroom-auto-grade-wrong-drill.md](./wbs-classroom-auto-grade-wrong-drill.md)。

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 标答格式乱 | 解析失败 → `ungraded` 或判错策略写清并单测；不猜测 |
| 主观「意思对但字面不同」被判错 | 产品已接受；M4+ 手批 |
| 变式与例题能力混淆 | UI 文案区分；变式种子审计日志 |
| 双轨存储 | 同一 schema |
| AI 成本 | 预览确认；队列与重试上限 |

---

## 8. 拍板记录

| 日期 | 确认项 | 结论 |
|------|--------|------|
| 2026-07-25 | 主观题计分 | 要计分；确定性比对，禁止 AI 猜 |
| 2026-07-25 | 巩固卷 | 同题型新题 **与** 错题变式 **都要** |
| 2026-07-25 | 改交 | 提交后不允许修改 |
| 2026-07-25 | CSV/图表 | 推迟提供 |
| 2026-07-25 | 填空比对 | 规范化字符串全等 **与** 可配置数值容差 |

---

## 9. 参考路径

- `src/lib/classroom.functions.server.ts`、`src/routes/student.tsx`、`src/routes/teacher.tsx`
- `src/lib/studentAnswers.shared.ts`、`src/lib/stripExamAnswersForStudent.shared.ts`
- `src/routes/generate.tsx`、`src/lib/generateCatalog.ts`、`src/lib/exam-generation.server.ts`
- `generateExamplesForExistingExam`（变式参考，勿直接当错题卷）
