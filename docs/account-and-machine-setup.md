# 账号登录与换机建表

- 关联：[prd-account-three-portal.md](./prd-account-three-portal.md)、[prd-account-mysql-local-scope.md](./prd-account-mysql-local-scope.md)、[wbs-account-mysql-local.md](./wbs-account-mysql-local.md)
- 约束：不硬编码账号/试卷 ID；不伪造用时与分数；**禁止**在文档或代码中写死主机/样例密钥
- **本机角色旁路（localRole / localStorage 师生角色）已取消**：必须真实登录

---

## 换机：两条账号路径（任选或并存）

### 路径 A — 本机 MySQL 账号栈（方案 A，推荐本机/离线）

1. 打开公开页 **`/setup`** → **主步骤 1** 填写并保存本机 MySQL 连接（无预填主机/库名）。
2. 同页点击「执行建表」（含试卷表 + `local_accounts` / `local_sessions`）。空库时自动种子运维账号（默认登录名/密码见 `MPG_LOCAL_SEED_ADMIN_*`，未设时为文档约定值；密码 bcrypt，非明文）。
3. （条件）若建表后仍无账号：在 **主步骤 2**「首个运维」手工创建；通常空库种子已足够。
4. 用种子/新建账号在 `/login` 登录（登录名可用工号字段对应的种子登录名）。
5. 登录后可在运维端继续建师生号（写入本机 MySQL）。

可选：配置 `MPG_LOCAL_SESSION_SECRET`（会话材料）；未配置时服务端会在 `data/local-session-master.key` 生成本机密钥（勿提交 Git）。

### 路径 B — 云端 Supabase（次路径，可跳过）

1. `/setup` 展开 **「可选 · 云端」**，填写账号服务地址 / 浏览器登录密钥 / 服务端密钥 / 云端数据库连接串并保存；需要本页一键建表时勾选允许。
2. 点击「执行初始化」或终端 `npm run db:apply`。
3. 账号库就绪后黄条消失，再使用 `/login`。

两条路径**可并存**；**本机账号表就绪时登录优先走 MySQL**。

未登录允许：填写/保存本机配库、只读探测、打包/复制 SQL、条件允许时一键迁移、本机 MySQL 建表与首个运维 bootstrap。  
未登录不允许：课堂作业等业务。页面不预填主机或样例密钥。

---

## 账号栈 vs 设置页「数据库」

| 连接 | 用途 | 师生登录 / 名册 |
|------|------|-----------------|
| `/setup` **本机 MySQL** + 建表（含账号表） | 试卷/规则 **与** 本机账号栈 | **是**（表就绪后） |
| `DATABASE_URL` + `/setup`「执行初始化」或 `npm run db:apply` | 云端 Postgres 迁移 | 云端建表通道 |
| `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` | 云端登录 | 登录可以，名册仍需 Service Role |
| 再加 `SUPABASE_SERVICE_ROLE_KEY` | 云端服务端账号/师生/作业定向 | **是**（云端路径） |

本机 MySQL 账号就绪且未配云端时：课堂作业读写 `data/classroom-assignments.json`；班级与名册优先写入本机 `local_classes` / `local_class_members`（建表脚本含此表；首次使用也可自动补表），否则回退 `data/classroom-classes.json`。配好云端 Service Role 并执行班级迁移后改用云端表。

**界面提示**：首页、登录页展示黄色「需要建表」指引；公开页 `/setup` 为换机免登录配库台。建表成功并刷新后提示自动消失。

---

## 登录标识

- 凭据载体：邮箱 + 密码（密码 bcrypt 加盐；云端或本机）
- 档案列：`login_phone` / `student_no` / `employee_no`（运维建号时可填）
- 登录页「账号」可填邮箱、手机号、学生号或教师工号

---

## 换电脑：云端数据表（migrations）

仓库内云端 SQL 唯一来源：`supabase/migrations/`。本机 MySQL DDL：`sql/mysql/zhixue_schema.sql`。

**方式 A — 公开 `/setup`（推荐，免登录）**

1. 本机路径：主步骤 1（连接+建表）及条件性首个运维即可；云端路径：展开「可选 · 云端」，表单配置连接串并允许本页一键建表（或 `.env` + `ALLOW_UI_DB_MIGRATIONS=true`）
2. 云端：打开 `/setup` → 展开可选云端 → 「执行初始化」，或高级内加载/复制 SQL 到云端 SQL Editor

**方式 B — 终端（云端）**

```bash
# 已配置 DATABASE_URL 后
npm run db:apply
```

登录后可在「设置 → 偏好」选择试卷保存落点与使用偏好；**连接与建表仍以公开页 `/setup` 为准**。更多账号产品口径见 [prd-account-three-portal.md](./prd-account-three-portal.md)。
