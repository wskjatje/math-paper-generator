# 接口摘要：课堂作业（年级 / 定向发布 / 开始计时）

> 实现文件：`src/lib/classroom.functions.server.ts`、纯函数 `src/lib/classroomAssignment.shared.ts`（含单测 `*.test.ts`）
> 迁移：`supabase/migrations/20260725140000_account_three_portal.sql`（`assignment_targets`、`classroom_assignments.grade_id`、`classroom_submissions.started_at`）+ `20260725150000_classroom_submission_started.sql`（`submitted_at` 允许为空）
> 本机 JSON 落盘：`data/classroom-assignments.json`（version 仍为 1；非演示模式）

## 1. 数据契约

```ts
type ClassroomAssignment = {
  id; exam_id; teacher_label; title; class_name; due_at; hide_answers; created_at; teacher_user_id?;
  grade_id: string | null;              // GRADE_LEVEL_OPTIONS.id，历史作业为 null
  target_student_ids?: string[];        // 仅教师视角返回；缺省 = 全体可见
  target_mode?: "all" | "selected";
};

type ClassroomSubmission = {
  id; assignment_id; student_label; answer_payload; submitted_at; student_user_id?; grade_result?;
  started_at?: string | null;           // 历史行为 null → 用时不可算
};
```

**进行中占位行**：`submitted_at = null` 且无 `grade_result`；`answer_payload = {version:1,answers:{}}`。
提交时**原地 UPDATE 同一行**，因此 `20260719090000` 的唯一约束（每作业每学生一行）继续成立。
历史行（有 `submitted_at`、无 `grade_result`）仍判为「已提交」，不会被误认为进行中而允许改交。

## 2. ServerFn

| ServerFn | 角色 | 输入（除 accessToken / localRole） | 返回要点 |
|----------|------|-----------------------------------|----------|
| `createClassroomAssignment` | 教师 | 原有字段 + `gradeId?`、`targetStudentIds?`、`visibleToAll?` | `{ assignment }`；写 `grade_id` 与 `assignment_targets`。**不**生成讲解视频；讲解须先在 `/explain-practice` 一键生成，学生端按卷+题播放已 ready 包。 |
| `cancelClassroomAssignment` | 教师 | `assignmentId` | `{ ok, assignmentId }`；删除作业、定向名单与全部作答（不可逆） |
| `listClassroomAssignments` | 教师 / 学生 | `scope` | 教师：自己发布的（含名单摘要）；学生：定向命中 ∪ 无名单，且年级适用；不返回他人 id |
| `markAssignmentStarted` | 学生 | `assignmentId`、`studentLabel?` | `{ ok, status, startedAt, reason? }`，幂等 |
| `submitClassroomAssignment` | 学生 | 原有字段 | `{ ok, gradeResult, startedAt, submittedAt, durationSec }` |
| `getMyClassroomSubmission` | 学生 | `assignmentId`、`studentLabel?` | `{ submission, startedAt, durationSec }`；进行中 → `submission: null` |
| `listMyAssignmentStatuses` | 学生 | `studentLabel?` | `{ statuses: StudentAssignmentStatus[] }`（pending / in_progress / submitted + 分数 + 用时） |
| `listClassroomSubmissions` | 教师 | `assignmentId` | 仅已提交行（排除占位行），按提交时间倒序 |
| `listAssignmentRoster` | 教师 | `assignmentId` | `{ targetMode, entries, summary }`：每生状态、分数、用时、错题题型摘要；未提交定向学生也在列 |
| `listExamsPublishStatusForGrade` | 教师 | `gradeId` | `{ exams: ExamPublishStatus[], publishedCount }`：该年级试卷是否已布置、布置给谁 |

## 3. 规则口径

- **年级**：必须是 `GRADE_LEVEL_OPTIONS.id`（如 `hs_g2_s1`）；空值合法（不选年级），非法值报错。
- **发布对象**：已配置 Supabase 且教师已登录时，必须 `visibleToAll === true` 或 `targetStudentIds.length > 0`，否则报「请选择接收学生或勾选全体可见」；仅本机 JSON 落盘时默认全体可见。
- **定向写入失败不降级**：`assignment_targets` 写入失败会回滚作业并报错（缺表时提示先执行迁移），避免误变全体可见。
- **年级适用性**（学生列表）：定向命中优先；全体可见作业在「作业年级」与「学生档案年级」均已知且不同时隐藏，任一未知则保持可见。
- **用时**：`durationSec` 仅在 `started_at` 与 `submitted_at` 均有效且时序正常时返回，否则 `null`（不倒推历史）。
- **重复提交**：已有 `grade_result` 或 `submitted_at` → 沿用原错误文案拒绝。
- **未迁移环境**：缺 `grade_id` / `started_at` / `grade_result` 列时逐级降级写入；开始计时无法降级，会给出「先执行 `npm run db:apply`」的明确错误。

## 4. 验证

- `npx vitest run`（47 文件 / 279 测试通过），新增 `src/lib/classroomAssignment.shared.test.ts`（12 例）。
- `npx eslint`（改动文件）与 `npx tsc --noEmit`（改动文件无新增报错）。
- 未做：真机云端 Supabase 联调（需先执行两个迁移）；前端接入与 e2e 由前端 / QA 负责。
