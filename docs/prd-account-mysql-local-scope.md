# 范围收口：师生账号/登录是否可走本机 MySQL

- 关联：[prd-account-three-portal.md](./prd-account-three-portal.md)、[account-and-machine-setup.md](./account-and-machine-setup.md)、[wbs-account-mysql-local.md](./wbs-account-mysql-local.md)
- 状态：**已确认方案 A**（2026-07-25）——本机 MySQL 完整账号栈；排期见 WBS
- 用户原话：「师生账号、登录也可以走本地 MySQL 数据，同时可以支持用户信息、试卷、规则所有的信息存储。」

### 拍板摘要（确认后有效）

| # | 口径 |
|---|------|
| 方案 | **A**：MySQL 作为本机场景完整账号栈（登录、会话、师生档案；与试卷/规则同库） |
| 与 Supabase | **可并存**；**MySQL 账号表就绪时优先本机登录**；不承诺双向实时同步 |
| 密码 | **必须哈希加盐**（不可逆）；禁止明文 |
| 原 `mysql_only` | **废除**「永远不能当账号库」的产品/运行时口径；表未建时提示需执行建表 |
| 配置 | **禁止硬编码**主机/密钥；走设置页 / env / runtime-env / 现有 MySQL 连接加密存储 |

---

## 1. 现状边界（证据路径）

### 1.1 账号/登录现依赖 Supabase Auth + `user_profiles`，与本机 MySQL 无关

- 登录：`signInWithAccount`（`src/lib/auth.functions.server.ts:65-90`）用 `@supabase/supabase-js` 的 `client.auth.signInWithPassword` 完成密码校验，账号可为邮箱/手机号/学生号/工号（先在 `resolveAuthEmailFromIdentifier` 映射为邮箱）。
- 档案与角色：`user_profiles`（`supabase/migrations/20260715140000_user_profiles_auth.sql`、`20260725160000_user_profile_roles.sql`、`20260725170000_user_profile_login_identifiers.sql`）存 `roles text[]`、`login_phone`/`student_no`/`employee_no` 等登录标识列，均在 Postgres（Supabase）侧。
- 师生名册/定向发布等服务端写操作需要 `SUPABASE_SERVICE_ROLE_KEY`（`src/lib/auth.functions.server.ts:114`：`"服务端未配置 SUPABASE_SERVICE_ROLE_KEY，无法写入档案"`）。
- 前端状态机 `useAuth`（`src/hooks/useAuth.tsx`）全程只有 `mode: "supabase" | null`，不存在 MySQL 登录分支。

### 1.2 本机 MySQL 现有 schema 明确不含账号/用户表

`sql/mysql/zhixue_schema.sql` 只建了 5 张表：`exams`、`questions`、`examples`、`ai_settings`、`generation_habits`（试卷、题目、例题、AI 设置、出题习惯/规则画像）。**没有** `users`/`user_profiles`/`sessions`/`roles` 类表，也没有密码字段。全仓搜索未发现任何 `bcrypt`/`scrypt`/`argon2`/密码哈希实现（已用 Grep 核实：0 命中）——即代码库里从未实现过"本机密码登录"这件事，现在也没有。

MySQL 连接信息本身的密码是加密存的（`src/lib/mysqlConnection.server.ts:1-4`：AES-256-GCM，密钥来自 `MYSQL_PASSWORD_ENC_KEY` 或首次生成的 `data/mysql-password-master.key`），但这是"仓库如何保管你填的 MySQL root/业务账号密码"，跟"师生用户密码怎么存"是两件不同的事。

### 1.3 代码里已经写死的定位判断：MySQL ≠ 账号库（待方案 A 废除）

`src/lib/accountAdmin.functions.server.ts:60-90` 定义了账号栈状态机，其中一档就是 `mysql_only`，对应提示原文：

> "当前仅连接了设置页的本机 MySQL（试卷等用途），不是师生账号库。账号/名册需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（及 PUBLISHABLE_KEY 用于登录）。"

这不是文档口径，是**运行时判断逻辑**。方案 A 落地后须废除「永远不能当账号库」语义：MySQL 已连接且账号表就绪 = 账号库可用（可与 Supabase 并存）。

### 1.4 文档口径三处一致（确认前；M4 须同步改写）

- `docs/prd-account-three-portal.md:15`：账号权威为本机 MySQL 或云端；禁止未认证角色旁路；未配置或未建表时业务操作拒绝。
- `docs/account-and-machine-setup.md`：本机 MySQL 连上不等于账号库就绪；须完成建表/登录配置后业务才可用。
- `AGENTS.md`（仓库根）未提及 MySQL 与账号相关；MySQL 仅出现在建表/换机脚本语境（`npm run db:bundle|db:apply` 是 Postgres 迁移，与 MySQL 无关）。

**结论（确认前基线）**：现状下，"账号登录走本机 MySQL"是**从零新增的能力**。方案 A 已确认后，按 [wbs-account-mysql-local.md](./wbs-account-mysql-local.md) M1–M4 交付。

---

## 2. 用户意图 → 可选产品方案

### 方案 A：MySQL 作为本机/离线场景下的完整账号栈替代（登录、会话、师生、试卷、规则全部落 MySQL，脱离 Supabase）— **已确认执行**

- **要新增的能力面**：
  - 密码哈希与校验（bcrypt/argon2 等，目前 0 行代码）
  - 会话/Token 签发与校验（等价于 Supabase 的 JWT+`access_token`/`refresh_token`，目前无任何自建 session 机制）
  - "Service Role 等价物"：一个能绕过普通用户权限、代表服务端写师生名册/定向作业的可信身份与密钥管理
  - 行级权限/角色隔离（Supabase 靠 RLS + `SERVICE_ROLE_KEY`；MySQL 需要自建等价的应用层鉴权）
  - `user_profiles` 及登录标识（邮箱/手机号/学号/工号）迁移到 MySQL 的表结构与唯一索引
  - 登录页/`useAuth`/所有依赖 `resolveAuthContext`、`bootstrapAdminIfNeeded` 等 Supabase 专用调用的前后端改造
- **验收口径（若走这条路）**：
  - 断网/无 Supabase 环境下，师生可用邮箱/手机号/学号/工号+密码登录、保持会话、按角色进出对应门户
  - 教师建号、师生名册、定向发布在纯 MySQL 环境下可用且有权限隔离（非"任何登录用户都能改任何人数据"）
  - 密码以业界认可的哈希算法加盐存储，不可逆
  - 与现有 Supabase 账号栈的关系（二选一/共存/迁移）有明确说明，不产生"两套账号互不认识"的用户困惑
- **明确不做**：不在这条路径下再维护 RLS 策略迁移到 MySQL（工作量不对等）；不承诺与 Supabase 账号双向实时同步（那是方案 B/C 的范畴）
- **主要风险**：
  - 安全：自建密码哈希/会话极易踩坑（弱哈希、会话固定、缺 CSRF/重放防护、"Service Role 等价密钥"一旦仅靠应用层校验，防护面明显弱于 Supabase Auth + RLS 的组合防线）
  - 维护双认证体系（Supabase 与 MySQL）长期并存的心智与代码复杂度
  - 现有 `user_profiles`/RLS/Service Role 相关迁移（`supabase/migrations/*`）需要等价重做，工作量远超"建几张表"

### 方案 B：MySQL 仅作本机镜像/双写，云端 Supabase 仍为账号权威（登录/会话/鉴权不变，MySQL 只多存一份试卷/规则/只读用户信息快照）— **未采纳**

- **要新增的能力面**：
  - 试卷/题目/规则（ai_settings、generation_habits 已有表结构）在写入 Supabase 后，异步或同步镜像一份到本机 MySQL，供本机场景下只读查询/离线浏览
  - 若要"支持用户信息存储"，只做**只读快照**（如 `user_profiles` 的非敏感字段镜像），不接管登录、不存密码、不做鉴权判定
  - 需要定义"谁是权威源、谁是镜像、冲突如何处理（通常单向 Supabase→MySQL）"
- **验收口径**：
  - 登录/会话/角色鉴权全部不变，仍走 Supabase（回归现有全部验收标准）
  - MySQL 侧数据与 Supabase 侧保持一致性（可接受的同步延迟，明确写在文档里）
  - 断开 MySQL 不影响任何登录/账号/课堂业务（因为 MySQL 只是"多一份"，不是"唯一来源"）
- **明确不做**：不用 MySQL 做登录判定；不把 MySQL 侧用户信息当作可写权威；不实现密码/会话相关任何本机存储
- **主要风险**：
  - 双写一致性、失败重试、脏读窗口需要设计（比"直接读 Supabase"多一层维护成本）
  - 若用户后续误以为"MySQL 有账号数据=MySQL 能登录"，需要在 UI/文档持续强调只读镜像身份（现有 `mysql_only` 状态提示已经在做这件事）

### 方案 C（从代码事实推导的更稳方案）：维持"账号=Supabase Auth+`user_profiles`"不变，MySQL 专注扩展"试卷+规则"存储的深度和覆盖面，不碰用户/登录/会话 — **未采纳（曾为推荐默认）**

- **要新增的能力面**：
  - 在现有 `zhixue_schema.sql`（exams/questions/examples/ai_settings/generation_habits）基础上，按需扩展"规则"相关表（如更细的出题规则、模板、知识点标签库），继续用**执行脚本建表**（延续 `applyZhixueMysqlSchema` 的模式），不新增账号字段
  - 若确有"本机离线看到师生名字"的需求，走方案 B 的只读镜像子集，而不是登录能力
- **验收口径**：
  - 试卷/规则相关数据在 MySQL 侧的读写路径清晰、脚本可重复执行（`CREATE TABLE IF NOT EXISTS` 幂等）
  - 账号/登录侧验收标准与现状（`docs/prd-account-three-portal.md`）完全不变，零回归
- **明确不做**：不做登录、会话、密码存储、Service Role 等价物
- **主要风险**：最低——不触碰账号安全面；唯一风险是"没有完全满足用户原话里'账号、登录也可以走本地 MySQL'的字面期待"，需要用户明确知情并认可

---

## 3. 推荐默认方案 + 理由（历史记录；已被拍板覆盖）

**（确认前）推荐方案 C 为默认基线，方案 B 作为可选增量；不推荐方案 A 作为默认路径。**

**（2026-07-25）用户已确认执行方案 A**，并附加：与 Supabase 可并存、MySQL 账号表就绪时优先本机登录、密码哈希加盐、废除 mysql_only「永远不能当账号库」。实施以 [wbs-account-mysql-local.md](./wbs-account-mysql-local.md) 为准。原推荐 C 的理由（安全面与成本）仍作为风险输入保留在 WBS §10，不作为范围否决。

---

## 4. 需向用户确认的关键问题（已关闭）

1. **"登录也可以走本地 MySQL"的真实场景是什么？** → **已确认方案 A（离线/本机可登录）**。
2. **与现有 Supabase 账号栈关系？** → **长期可并存；MySQL 账号表就绪时优先本机登录**；不做双向实时同步。
3. **"用户信息"是否含密码等敏感凭据？** → **含；必须哈希加盐，不可明文**。
4. **"规则"具体指什么？** → 与方案 A 同库：现有 `ai_settings`/`generation_habits` 等试卷/规则能力保持；账号为新增表，不阻塞规则扩展。
5. **`mysql_only`「连上也不等于账号库」是否保持？** → **否；废除该口径**（表未就绪时改为「需执行账号建表」类提示）。

---

## 附：本文档明确不做的事

- 不代写任何实现代码（登录、会话、MySQL 建表脚本改动等），需在范围确认后交给对应工程 Agent（后端/DevOps）——**范围已确认，实现按 WBS 派单**。
- 人天排期见 [wbs-account-mysql-local.md](./wbs-account-mysql-local.md) §1（起止日期待确认人力）。
- 不编造"MySQL 已支持登录"的既有实现；不提供示例连接串/主机名/密钥。
