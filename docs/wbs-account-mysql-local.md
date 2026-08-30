# WBS：本机 MySQL 完整账号栈（方案 A）

> **范围冻结依据**：[prd-account-mysql-local-scope.md](./prd-account-mysql-local-scope.md)（**已确认方案 A**，2026-07-25）  
> **关联**：[prd-account-three-portal.md](./prd-account-three-portal.md)、[account-and-machine-setup.md](./account-and-machine-setup.md)、[wbs-account-three-portal.md](./wbs-account-three-portal.md)  
> **拍板覆盖（用户已确认）**：
> 1. **方案 A**：本机 MySQL 作为完整账号栈（登录、会话、师生档案、与现有试卷/规则表同库）。
> 2. **与 Supabase 可并存**；**MySQL 账号表就绪时优先本机登录**（不要求双向实时同步账号）。
> 3. **密码必须哈希加盐**（业界认可算法，不可逆；禁止明文）。
> 4. **废除** `mysql_only`「永远不能当账号库」的产品/运行时口径；连接 MySQL 且账号表就绪 = 账号库可用。
> 5. **禁止硬编码**主机/密钥/样例连接串；配置继续走设置页 / `.env` / `data/runtime-env.local.json` / 现有 MySQL 连接加密存储。
> **状态**：排期草案 · 2026-07-25  
> **会话隔离建议**：M1（表结构+哈希+栈状态）/ M2（登录会话）/ M3（运维建号鉴权）/ M4（门户与文档收口）宜分 Chat 或分支；审计以 PR + 本 WBS 任务 ID 追溯。

---

## 0. 范围冻结前提

本 WBS 以 scope PRD 方案 A + 上文「拍板覆盖」为唯一范围来源。下列事项**不在 M1–M4 内**：

- 与 Supabase Auth 的双向实时同步、账号合并向导、SSO。
- 将 Postgres RLS 策略「等价搬迁」到 MySQL（应用层鉴权即可）。
- 自助注册重开；按邮箱/题号/试卷 ID 硬编码分支。
- 把课堂作业主存储整体迁出 Supabase（本里程碑只保证**在 MySQL 账号会话下**能完成既有师生业务所需的鉴权入口；作业表是否双写另立 PRD）。
- 在文档或代码中预填示例主机名、root 密码、JWT 密钥明文。

**明确不做（继承 scope PRD）**：不代写需求定稿变更以外的实现包干；安全评审结论由 security/review 角色签字，不由本 WBS 伪造「已安全」。

---

## 1. 项目周期（待确认）

| 里程碑 | 计划窗口（人日估算） | 说明 |
|--------|----------------------|------|
| **M1** 账号表 + 密码哈希 + 栈状态重写 | 4～6 人日 | 阻塞 M2–M4 |
| **M2** 本机登录/会话 + 优先 MySQL | 5～7 人日 | 依赖 M1 |
| **M3** 运维建号 / 名册 / 服务端可信写 | 5～7 人日 | 依赖 M2 |
| **M4** 三端门户验收 + 文档/回归收口 | 3～5 人日 | 依赖 M3 |

**总工期估算（待确认）**：约 **17～25 人日**（含 QA 与文档）；未含 Code Review 往返、`frontend_exec_confirm`、真实换机演练窗口。具体起止日期待用户确认可用人力后标注。

---

## 2. 里程碑总览

| 里程碑 | 交付摘要 | 验收挂钩 | 建议主责 Agent |
|--------|----------|----------|----------------|
| **M1** | MySQL 账号相关表（脚本幂等）+ 密码哈希加盐模块 + `AccountStackStatus` 废除「永远不能当账号库」+ 就绪探测 | AC-DB、AC-PWD、AC-STACK | backend-engineer → devops-engineer → qa-engineer |
| **M2** | 会话签发/校验；登录优先 MySQL；`useAuth` 支持 `mysql`；无 Supabase 可登录 | AC-LOGIN、AC-SESS、AC-PREF | backend-engineer → frontend-engineer → qa-engineer |
| **M3** | 运维建号/多身份/登录标识；bootstrap；应用层权限（Service Role 等价仅服务端） | AC-ADMIN、AC-AUTHZ | backend-engineer → frontend-engineer → qa-engineer |
| **M4** | 三端门户在 MySQL 账号下可进出；文档与 AGENTS / account-and-machine-setup 口径同步；回归清单 | AC-PORTAL、AC-DOC、AC-REG | frontend-engineer → qa-engineer → engineering-technical-writer |

---

## 3. 依赖顺序

```
M1-A 账号表 DDL（幂等，扩展 zhixue schema）
  │
M1-B 密码哈希加盐（纯模块 + 单测）
  │
M1-C 栈状态 / 就绪探测 / 文案废除 mysql_only「非账号库」
  │
  ▼
M2-A 会话存储与 Token（密钥仅环境/本地文件，无硬编码）
  │
M2-B signIn / resolveAuthContext 优先 MySQL
  │
M2-C useAuth + 登录页双栈并存 UI 最小改动
  │
  ▼
M3-A 运维建号 / 标识唯一 / 角色写入 MySQL
  │
M3-B bootstrap 运维 + 服务端可信写路径
  │
M3-C accountAdmin ServerFn 走 MySQL 就绪分支
  │
  ▼
M4-A 三端路由在 mysql 会话下门禁一致
  │
M4-B 文档（three-portal / account-and-machine-setup / AGENTS）+ 回归
```

**硬依赖**：M1-B∥可与 M1-A 并行，但 M1-C 依赖两者；M2 依赖 M1 全部；M3 依赖 M2-B；M4 依赖 M3。

**软依赖**：M2-C 可在 M2-B 契约冻结后与 M3-A 部分并行（不同文件域）；禁止单会话混做 M1 DDL 与 M3 UI。

---

## 4. M1：账号表 + 密码哈希 + 栈状态重写

### M1-W1 · MySQL 账号表 DDL（幂等）

| 项 | 内容 |
|----|------|
| **目标** | 在本机 MySQL schema 中新增账号相关表（用户档案、登录标识、密码凭据、会话），`CREATE TABLE IF NOT EXISTS` 幂等；**不含**硬编码主机。 |
| **依赖** | 无 |
| **建议 Agent** | **backend-engineer**（DDL）→ **devops-engineer**（建表入口复用） |
| **交付物（文件级）** | `sql/mysql/zhixue_schema.sql`（或拆分 `sql/mysql/account_schema.sql` 并由 apply 串联）；`src/lib/mysqlSchemaApply.server.ts`；必要时 `src/lib/mysqlSettings.functions.server.ts` / `src/components/setup/MysqlBootstrapPanel.tsx` 文案「含账号表」。 |
| **DoD** | 设置页「执行建表」或现有 apply 路径一次跑通；表含：用户主键、roles、默认 role、email/phone/student_no/employee_no 唯一约束、`password_hash`、会话 token 哈希或 opaque id、时间戳；无明文密码列语义。 |
| **风险** | 与现有 5 表混在同一库命名冲突 → 统一前缀或独立表名清单写入 schema 注释。 |
| **验收** | **AC-DB**：空库执行脚本后账号表存在且可重复执行无报错。 |

---

### M1-W2 · 密码哈希加盐模块

| 项 | 内容 |
|----|------|
| **目标** | 提供 `hashPassword` / `verifyPassword`（argon2 或 bcrypt，团队择一并写死默认参数）；全仓禁止明文落库。 |
| **依赖** | 无（可与 M1-W1 并行） |
| **建议 Agent** | **backend-engineer** |
| **交付物** | 建议：`src/lib/passwordHash.server.ts`、`src/lib/passwordHash.server.test.ts`；`package.json` 增加依赖（若尚无）。 |
| **DoD** | 单测：正确密码通过、错误拒绝、同口令两次哈希不同（盐随机）；Server 外不可被客户端 import 误用（仅 `.server`）。 |
| **风险** | 算法选型争论 → M1 冻结一种；迁移算法留版本前缀字段（如 `algo`/`params`）可选。 |
| **验收** | **AC-PWD**：库内仅存哈希；无 Grep 命中明文密码写入路径。 |

---

### M1-W3 · 账号栈状态机重写（废除「永远不能当账号库」）

| 项 | 内容 |
|----|------|
| **目标** | 重写 `deriveAccountStackStatus` / `accountStackStatusMessage`：MySQL 已连接且账号表就绪 → 账号库可用（可与 Supabase 并存枚举）；删除/改写「不是师生账号库」类死句；未建账号表时明确「需执行建表」。 |
| **依赖** | M1-W1（就绪探测依赖表存在） |
| **建议 Agent** | **backend-engineer** → **frontend-engineer**（若设置页展示状态文案） |
| **交付物** | `src/lib/accountAdmin.functions.server.ts`；调用方提示 UI（设置/运维相关组件）；单测若有则跟进。 |
| **DoD** | 类型上不再把「仅 MySQL 连接」映射为永久不可用账号库；新增明确状态如 `mysql_account_ready` / `mysql_needs_account_schema`（命名以实现为准）；文档句与 UI 一致。 |
| **风险** | 旧文案散落 account-and-machine-setup/AGENTS → M4 统一收口，但 M1 须改**运行时**真相源。 |
| **验收** | **AC-STACK**：仅连 MySQL 且表就绪时，账号管理入口不再因「mysql_only 非账号库」被拒。 |

---

## 5. M2：本机登录 / 会话 + 优先 MySQL

### M2-W1 · 会话签发与校验

| 项 | 内容 |
|----|------|
| **目标** | 自建会话（opaque token 或签名 JWT，二选一写死）；密钥来自环境变量或受控本地文件（类比 `MYSQL_PASSWORD_ENC_KEY` / `data/mysql-password-master.key` 模式），**禁止**仓库内默认密钥。 |
| **依赖** | M1-W1、M1-W2 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | 建议：`src/lib/localSession.server.ts`（或等价）；会话表读写；登出失效。 |
| **DoD** | 未配置密钥时拒绝签发并给出可操作提示（指向设置/env，无样例密钥）；过期/篡改 token 拒绝。 |
| **风险** | 会话固定、缺轮换 → 最低要求：登录后发新会话、登出删会话；CSRF 若 cookie 方案须 SameSite 策略文档化。 |
| **验收** | **AC-SESS**：登录得会话；断进程后仍可校验直至过期/登出。 |

---

### M2-W2 · 登录路径优先 MySQL

| 项 | 内容 |
|----|------|
| **目标** | `signInWithAccount` / `resolveAuthContext*`：MySQL 账号就绪时**优先**本机校验（标识→用户→verifyPassword→会话）；否则回落现有 Supabase；无双端同时「半登录」脏状态。 |
| **依赖** | M2-W1、M1-W3 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | `src/lib/auth.functions.server.ts` 及抽取的 shared/server 辅助模块；标识解析复用现有「邮箱/手机/学号/工号」语义。 |
| **DoD** | 无 Supabase 环境变量时，MySQL 就绪仍可登录；两套并存时优先 MySQL（与拍板一致）；错误文案不泄露「用户是否存在」过度细节（统一失败提示即可）。 |
| **风险** | 同一标识在两边各有账号 → 文档声明「优先 MySQL」；不做自动合并（非本里程碑）。 |
| **验收** | **AC-LOGIN**、**AC-PREF**。 |

---

### M2-W3 · 前端 `useAuth` / 登录页

| 项 | 内容 |
|----|------|
| **目标** | `useAuth` 支持 `mode: "mysql" | "supabase" | null`；登录成功后会话保持与门户跳转与现网一致。 |
| **依赖** | M2-W2 |
| **建议 Agent** | **frontend-engineer** |
| **交付物** | `src/hooks/useAuth.tsx`；`src/routes/login.tsx`；必要时 `src/components/auth/*`。 |
| **DoD** | 大规模视觉改版不在范围（保持现有登录 UI）；行为可测。 |
| **风险** | 前端误把 MySQL 密码打到日志 → 禁止 console 打印密码。 |
| **验收** | **AC-LOGIN**（浏览器路径）。 |

---

## 6. M3：运维建号、名册与应用层鉴权

### M3-W1 · MySQL 侧建号与标识

| 项 | 内容 |
|----|------|
| **目标** | 运维可创建多身份账号，写入 MySQL 档案与哈希密码、登录标识唯一约束。 |
| **依赖** | M2 |
| **建议 Agent** | **backend-engineer** → **frontend-engineer**（`admin` 表单若需微调） |
| **交付物** | `src/lib/accountAdmin.functions.server.ts`；`src/routes/admin.tsx`（最小改动接入）。 |
| **DoD** | 自助注册仍关闭；禁止明文密码 API 回显。 |
| **验收** | **AC-ADMIN**。 |

---

### M3-W2 · Bootstrap 与服务端可信写

| 项 | 内容 |
|----|------|
| **目标** | 首个运维 bootstrap（环境变量匹配邮箱/标识，语义对齐现有 `MPG_BOOTSTRAP_ADMIN_EMAIL`）；服务端写名册/定向作业所需的「可信身份」走**仅服务端**路径，不把等价密钥下发浏览器。 |
| **依赖** | M3-W1 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | auth/bootstrap 相关 server 模块；`.env.example` **仅变量名说明**（无真实密钥）。 |
| **DoD** | 无 `SUPABASE_SERVICE_ROLE_KEY` 时，MySQL 就绪分支下运维写操作可用；未授权角色拒绝。 |
| **风险** | 应用层鉴权弱于 RLS → 所有写接口必须 `assert*Access`；抽测越权。 |
| **验收** | **AC-AUTHZ**。 |

---

### M3-W3 · accountAdmin 全量改走就绪分支

| 项 | 内容 |
|----|------|
| **目标** | 名册列表、改角色、登录标识维护等 ServerFn 在 MySQL 就绪时读写 MySQL，不再硬依赖 Service Role。 |
| **依赖** | M3-W2 |
| **建议 Agent** | **backend-engineer** |
| **交付物** | `accountAdmin.functions.server.ts` 及教师端调用点契约保持。 |
| **验收** | **AC-ADMIN**、**AC-AUTHZ**。 |

---

## 7. M4：三端门户 + 文档 + 回归

### M4-W1 · 门户门禁一致性

| 项 | 内容 |
|----|------|
| **目标** | `/admin` `/teacher` `/student` 在 mysql 会话下与现有角色门禁一致（含运维身份隐藏师生导航）。 |
| **依赖** | M3 |
| **建议 Agent** | **frontend-engineer** → **qa-engineer** |
| **交付物** | `SiteHeader.tsx`、`PortalAccessWall.tsx`、各 portal 路由；冒烟记录。 |
| **验收** | **AC-PORTAL**（对齐 three-portal AC-L/A/T/S 行为，权威源改为「MySQL 或 Supabase，优先 MySQL」）。 |

---

### M4-W2 · 文档与口径同步

| 项 | 内容 |
|----|------|
| **目标** | 更新「账号权威仅 Supabase」「MySQL 连上也不等于账号库」等过时句；AGENTS / account-and-machine-setup 换机说明增加 MySQL 账号栈步骤（仍无硬编码样例）。 |
| **依赖** | M4-W1 行为稳定 |
| **建议 Agent** | **engineering-technical-writer**（或主会话按清单改） |
| **交付物** | `docs/prd-account-three-portal.md`；`docs/account-and-machine-setup.md`；`AGENTS.md`；本 WBS/scope 状态勾选。 |
| **验收** | **AC-DOC**。 |

---

### M4-W3 · 回归清单执行

| 项 | 内容 |
|----|------|
| **目标** | 按 §9 清单跑通；约定 vitest + 关键路径手动冒烟。 |
| **依赖** | M4-W1 |
| **建议 Agent** | **qa-engineer** |
| **验收** | **AC-REG**。 |

---

## 8. 验收标准汇总

| ID | 标准 |
|----|------|
| **AC-DB** | 脚本幂等创建账号相关表；设置页/apply 可执行；无预填主机。 |
| **AC-PWD** | 密码仅哈希加盐存储；校验模块有单测。 |
| **AC-STACK** | 废除「MySQL 永远不是账号库」；表就绪=账号库可用。 |
| **AC-LOGIN** | 无 Supabase 时可用邮箱/手机/学号/工号+密码登录并进门户。 |
| **AC-SESS** | 会话可保持/登出失效；密钥不入库不进前端包。 |
| **AC-PREF** | Supabase 与 MySQL 均配置时，登录优先走 MySQL。 |
| **AC-ADMIN** | 运维可建多身份账号并维护登录标识。 |
| **AC-AUTHZ** | 非授权角色不能写名册/建号；可信写仅服务端。 |
| **AC-PORTAL** | 三端门禁与多身份切换行为与 three-portal 一致（权威可为本机）。 |
| **AC-DOC** | account-and-machine-setup/AGENTS/three-portal 口径与实现一致。 |
| **AC-REG** | §9 清单通过；记录 Git SHA。 |

---

## 9. 回归清单（M4 执行）

1. **仅 MySQL**：配置连接 → 执行建表（含账号表）→ bootstrap 运维 → 建教师/学生 → 本机登录 → 三角色门户进出。
2. **仅 Supabase**：行为回归现网（MySQL 未就绪或不连时不破坏）。
3. **双栈**：两边皆可用时，登录优先 MySQL；文档说明冲突标识不自动合并。
4. **否定**：错误密码失败；学生调运维建号 API 失败；登出后带旧 token 失败。
5. **自动化**：至少 `passwordHash` 与栈状态/标识解析相关 vitest；项目约定 lint/test 通过。
6. **密钥卫生**：仓库 diff 无主机/密码/JWT 明文；`.env.example` 仅占位说明。

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 自建会话/密码栈安全债 | 高 | M1/M2 必须单测 + M4 越权抽测；可选 security-review 子代理签字后再标可上线 |
| 双认证长期并存复杂度 | 中 | 单一优先规则（MySQL 就绪优先）；禁止第三套未认证账号回退 |
| 课堂作业仍在 Supabase 时「能登录不能上课」 | 中 | M4 验收写清：作业存储依赖另轨；若需纯离线课堂另立 PRD |
| 旧 `mysql_only` 文案残留误导 | 中 | M1 改运行时；M4 全文检索收口 |
| 硬编码样例回潮 | 中 | Code Review 检查项；沿用现有连接加密与 runtime-env 模式 |

---

## 11. 建议执行 Agent（按里程碑）

| 阶段 | 顺序 |
|------|------|
| M1 | **backend-engineer** → **devops-engineer**（建表入口）→ **qa-engineer**（AC-DB/PWD/STACK） |
| M2 | **backend-engineer** → **frontend-engineer** → **qa-engineer** |
| M3 | **backend-engineer** → **frontend-engineer** → **qa-engineer** |
| M4 | **frontend-engineer** → **qa-engineer** → **engineering-technical-writer**；可选 **security-review** / **code-reviewer** |

主会话职责：按里程碑开独立 Chat/分支、勾选本 WBS 任务 ID、合并前跑约定验证；**不**在单会话内从 DDL 一路改到门户文案。

---

## 12. 主会话启动：M1 文件级任务清单（建议先做）

按顺序派 **backend-engineer**（可拆 2 个 Chat：DDL∥哈希，再合并栈状态）：

1. **扩展 schema**  
   - 改：`sql/mysql/zhixue_schema.sql`（或新增 `sql/mysql/account_schema.sql`）  
   - 改：`src/lib/mysqlSchemaApply.server.ts`（若拆文件则串联执行）  
   - 核对：`src/lib/mysqlSettings.functions.server.ts`（「读取/执行建表」仍指向正确 SQL）

2. **密码哈希模块（新文件）**  
   - 新：`src/lib/passwordHash.server.ts`  
   - 新：`src/lib/passwordHash.server.test.ts`  
   - 改：`package.json` / `package-lock.json`（argon2 或 bcrypt 依赖）

3. **就绪探测 + 废除 mysql_only 死口径**  
   - 改：`src/lib/accountAdmin.functions.server.ts`（`AccountStackStatus`、`deriveAccountStackStatus`、`accountStackStatusMessage`、探测「账号表是否存在」）  
   - 扫改引用文案：设置/运维相关组件（以 Grep `mysql_only` /「不是师生账号库」为准）

4. **换机/设置文案（M1 最小集，完整文档放 M4）**  
   - 改：`src/components/setup/MysqlBootstrapPanel.tsx`（说明建表含账号表；**无**样例主机/密码）  
   - 可选占位：`.env.example` 仅增加「本机会话密钥」变量**名**注释（无值）

5. **M1 完成定义检查**  
   - 本机执行一次 schema apply（用户自有连接，Agent 不写死主机）  
   - `npx vitest run` 覆盖 `passwordHash`（及若新增的 stack 单测）  
   - Grep 确认运行时不再宣称「MySQL 永远不是账号库」

**M1 不做**：登录 UI 大改、课堂作业迁库、Supabase 迁移文件改写、双向同步。
