# PRD：班级工作台（课堂中长期）

- 状态：已拍板执行（会话确认「按中长期更优方案」）
- 关联：`prd-account-three-portal.md`（原非目标「班级实体」在此升格）、`api-classroom-assignment.md`、`account-and-machine-setup.md`
- 约束：禁止硬编码主机/样例账号/班级 ID；年级取值仅 `GRADE_LEVEL_OPTIONS`

## 目标

教师以**班级**为容器进入工作台，班内仅一层主导航：`作业` / `学生` / `作答`。

- **作业**：只列本班已布置；「布置作业」为主 CTA，在向导内选试卷（不与已布置并列长列表）。
- **学生**：本班名册（成员增删）。
- **作答**：本班作业下的提交与进度。

## 非目标（本迭代）

- 行政班与教学班双模型、走班、多教师共班权限矩阵
- 把历史无 `class_id` 的作业自动归班（保留可读，不进班内列表）
- 学生端「我的班级」独立导航大改（沿用可见作业规则即可）

## 数据

| 实体 | 本机 MySQL | 云端 Supabase | 无云端时 |
|------|------------|---------------|----------|
| 班级 | `local_classes` | `classes` | `data/classroom-classes.json` |
| 名册 | `local_class_members` | `class_memberships` | 同上 `members` |
| 作业 | 现有课堂存储 + `class_id` | `classroom_assignments.class_id` | JSON `class_id` |

## 验收

1. 教师可创建班级（名称 + 年级），进入后看到三页签。
2. 布置作业须带 `class_id`；班内作业列表仅本班。
3. 无页签套页签；选卷仅在布置向导内。
4. 本机 MySQL 主路径可用；未配云端不报「账号服务未就绪」挡班列表。
