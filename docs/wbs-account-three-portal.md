# WBS：三端账号与年级作业体系

- 对应 PRD：[prd-account-three-portal.md](./prd-account-three-portal.md)
- 状态：MVP 已交付（2026-07-25）

## 里程碑

| ID | 内容 | 主要交付物 | 状态 |
|----|------|------------|------|
| M0 | 数据 + 鉴权底座 | migrations、`accountAdmin.functions.server.ts`、auth 扩展、types | 完成 |
| M1 | 运维端 | `src/routes/admin.tsx`、导航角色收敛、登录关闭自助注册 | 完成 |
| M2 | 教师端 | `teacher.tsx` 年级树 / 发布 / 名册 / roster + WrongDrill | 完成 |
| M3 | 学生端 | `student.tsx` 状态列表 / started_at / 结果复用 | 完成 |
| M4 | 文档与回归 | 本 PRD/WBS；课堂相关 vitest；路由 HTTP 冒烟 | 完成 |

## 关键路径

| 区域 | 路径 |
|------|------|
| 迁移 | `supabase/migrations/20260725140000_account_three_portal.sql`、`…150000_classroom_submission_started.sql` |
| 账号 ServerFn | `src/lib/accountAdmin.functions.server.ts` |
| 作业扩展 | `src/lib/classroom.functions.server.ts`、`src/lib/classroomAssignment.shared.ts` |
| 鉴权 | `src/lib/auth.functions.server.ts`、`src/hooks/useAuth.tsx` |
| UI | `src/routes/admin.tsx`、`teacher.tsx`、`student.tsx`、`login.tsx`、`SiteHeader.tsx` |

## 回归清单

1. 未配 Supabase：本地教师发布 → 学生提交 → 阅卷结果 → 错题巩固入口仍可用
2. 配齐 Service Role 后：执行迁移 → bootstrap admin → 建师生 → 定向发布 → 学生仅见自己作业 → 用时非「—」
3. 历史提交无 `grade_result` / 无 `started_at`：不伪造分数与用时
4. `npx vitest run src/lib/classroomGrade.shared.test.ts src/lib/wrongDrillComposition.shared.test.ts src/lib/classroomAssignment.shared.test.ts`
