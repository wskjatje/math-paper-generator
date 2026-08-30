# PRD：三端账号与年级作业体系

- 状态：**已实现（含多身份登录）**（2026-07-25）
- 关联：课堂阅卷 [prd-classroom-auto-grade-wrong-drill.md](./prd-classroom-auto-grade-wrong-drill.md)；作业 API [api-classroom-assignment.md](./api-classroom-assignment.md)
- 约束（硬）：禁止按邮箱/题号/试卷 ID 硬编码；年级与学科取值仅来自 `GRADE_LEVEL_OPTIONS` / `CURRICULUM_SUBJECT_OPTIONS`；禁止伪造历史提交用时或分数；不改 `SubmissionGradeResult` schema

---

## 1. 范围内

1. **落地页 `/` + 统一登录 `/login`**：未登录访问首页为居中介绍页（登录 CTA）；账号可为**邮箱 / 手机号 / 学生号 / 工号** + 密码；登录后按档案身份进入对应门户
2. **多身份**：`user_profiles.roles text[]` + `role`（默认身份）；登录后可切换当前展示身份；顶栏按**当前身份**展示导航
3. **运维端 `/admin`**：建号时可多选身份，并可填写手机号/学号/工号；**当前身份为运维时导航与路由不出现教师/学生端**
4. **教师端 `/teacher` / 学生端 `/student`**：仅当前身份匹配时可进入；须真实登录
5. **账号权威**：本机 MySQL 账号表（`local_accounts`）**或** Supabase Auth + `user_profiles`；**本机账号表就绪时登录优先 MySQL**；禁止未认证角色旁路；未配置或未建表时业务操作拒绝
6. **建表入口**：本机 `/setup` 主步骤「本机数据库」建表；云端为同页「可选 · 云端」或终端 `npm run db:apply`。登录后「设置 → 偏好」仅保留试卷保存落点等日常偏好，并以链接跳转配库；不重复连接状态卡与建表表单。IA 见 [prd-setup-ia.md](./prd-setup-ia.md)
7. **自助注册已取消**
8. **首个运维**：本机 `/setup`「创建首个本机运维账号」；云端 `MPG_BOOTSTRAP_ADMIN_EMAIL` 匹配后将 `admin` **并入** `roles`

## 2. 非目标

SSO、家长端、Excel 批量导入、作业草稿态、手批改分、自助注册。班级实体见 [prd-classroom-class-workbench.md](./prd-classroom-class-workbench.md)。

## 3. 关键决策

| # | 口径 |
|---|------|
| 默认入口 | `/` 未登录为落地页（登录 CTA → `/login`）；已登录 → 当前身份门户 |
| 当前身份 | 客户端 `activeRole`（localStorage），须 ∈ `roles` |
| 服务端权限 | `assertTeacherAccess` / `assertStudentAccess` 看档案 `roles` 是否含对应身份；**不含**「admin 自动放行师生」 |
| 运维 UI | `activeRole === admin` 时无师生导航与入口 |
| 年级/学科 | 仅配置表枚举 |
| 班级 | 见 [prd-classroom-class-workbench.md](./prd-classroom-class-workbench.md)；课堂以班级为容器 |

## 4. 验收要点

- AC-L：未登录访问 `/` 落到登录页；登录成功单身份直达门户，多身份可选/可切换
- AC-A：运维可建多身份账号；运维身份下无教师/学生导航
- AC-T / AC-S：仅对应身份可操作；切换后内容随身份变化
- AC-Q：无邮箱/题号硬编码；须真实登录（无角色旁路）

## 5. 环境变量

见 `.env.example`：`MPG_BOOTSTRAP_ADMIN_EMAIL`、`MPG_ALLOW_SELF_REGISTRATION`、`MPG_TEACHER_CAN_CREATE_STUDENT`；账号管理另需 `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SERVICE_ROLE_KEY`。

## 6. 迁移

- `supabase/migrations/20260725140000_account_three_portal.sql`
- `supabase/migrations/20260725150000_classroom_submission_started.sql`
- `supabase/migrations/20260725160000_user_profile_roles.sql`（`roles` 多身份）
- `supabase/migrations/20260725170000_user_profile_login_identifiers.sql`（手机号/学号/工号）
