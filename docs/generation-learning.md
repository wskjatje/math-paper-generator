# 可审计生成学习层

## 目标

在不允许运行时修改源码、任意正则或主提示词的前提下，让试卷与题图生成形成：

> 生成 → 结构化验证 → 自动重试/修复 → 脱敏事件 → 候选策略 → **自动同意** → 后续复用 → 可禁用

该层增强现有生成与 Diagram Pack 校验，不替代学科事实验证，也不会凭失败文本猜测新的学科规则。

## 安全边界

1. 学习事件不保存完整题干、答案、API Key 或外部 URL，只保存截断诊断摘要、稳定 issue code 与 SHA-256 证据哈希。
2. 运行时只能生成 `LearningStrategyId` 白名单内的 `prompt_policy` 候选。
3. 不允许模型生成并执行 JavaScript、正则、SQL、源码补丁或任意 transform。
4. 候选建议积累足够不同 generation run 的证据后**自动同意**（阈值见 `exam-domain.json` → `generationLearning.autoAgree.minEvidence`，默认 3）；串科学科/图类不一致的候选永不自动同意。
5. 只有 `approved` 且 `kind=prompt_policy` 的规则会注入后续同 stage/subject/pack 的生成提示；`ops_advisory` 可自动同意进面板，**不注入**命题 prompt。
6. 管理员可禁用已自动同意规则；禁用立即停止注入。
7. 新的自动修复算法仍必须通过代码评审、单元测试和 Diagram Pack 标定集进入代码。
8. 自动同意开关与阈值均为配置驱动（`generationLearning.autoAgree`），禁止在业务代码写死分子/题号。

## 数据

本地模式：

- `data/generation-learning/events.jsonl`：追加式高频事件流，默认不进 Git。
- `data/generation-learning/state.json`：候选、审批和禁用状态；不在 `.gitignore`，可作为项目审计数据提交。

Supabase：

- 迁移 `20260718140000_generation_learning_audit.sql` 提供事件与候选表。
- 两表启用 RLS，不创建客户端策略；设计为 service role / Admin Server Function 使用。

## 运行链

### 试卷

`runExamAiGenerationWithValidationRetryInner`：

1. 读取同学科 `exam` 范围的已批准策略并加入 `quality_hints`。
2. 第一轮输出执行既有完整校验。
3. 失败问题按稳定 code 记录为事件并聚合候选。
4. 既有紧急修正提示驱动第二轮生成。
5. 第二轮再次执行同一校验；仍失败则记录 `failed` 并拒绝保存。

### 题图

`generateFigureAttachmentForQuestion`：

1. 读取同学科/pack 的 `figure` 范围已批准策略。
2. 将策略传入 figure scene/SVG 生成提示。
3. 仍无法通过 parser、validator、题干对齐或渲染时记录失败事件。
4. 原有严格闸门继续决定是否允许入库；学习层无权绕过闸门。

### math.function 范围治愈（确定性，非学习）

模型常把区间写成单个数（`domain:0`、axes `x:0,y:0`）。`tryProcessDiagramScene` 在原始校验失败时会调用
`healMathFunctionSceneRanges`（`src/lib/diagram/mathFunctionHeal.shared.ts`）做一次修复后重验，仅使用两类可审计事实：

1. 题干显式区间（支持 LaTeX 常量：`[0, \frac{\pi}{2}]`、`2\pi` 等）；
2. 对 scene 自带白名单 `expr` 数值采样推导 y 范围。

已合法字段不改；题干无唯一区间且 axes 也无效时原样返回，仍由闸门拒绝。不发明题干没有的数值。

### 题图 JSON 解析失败（`figure.scene.parse_failed`）

配图模型返回的文本无法解析成 JSON 对象（多包 Markdown 代码围栏、解释文字、多个对象或尾随逗号）时：

- 先由确定性提取器 `extractFirstJsonObject`（`src/lib/diagram/jsonExtract.shared.ts`）兜底：剥围栏、括号配对取首个平衡对象、容忍尾随逗号。**只做格式容错，不猜测字段**。
- 仍失败才记录为 `figure.scene.parse_failed`，映射到白名单策略 `require_pure_json_figure_scene`（要求“只输出一个纯 JSON 对象”）。
- 审批后该策略注入配图模型提示，引导模型减少再犯；与“结构不合法”的 `figure.scene.invalid` 分开，便于分别归因。

## 跨学科

`LearningScope` 使用 `stage + subject + pack`，不硬编码数学题号或题面。新增学科题图时：

1. 按 `docs/diagram-system.md` 实现新的 Diagram Pack；
2. 为 pack 提供 parser、validator、stem alignment、deterministic renderer 与标定集；
3. 记录该 pack 的稳定 issue code；
4. 只有对应 scope 的已批准策略会影响该 pack。

当前 active pack：`math.geometry`、`math.function`、`physics.mechanics`（见 `data/diagram-packs/registry.json`）。学习层不会把数学规则自动套用到物理/化学等异族 pack；`subject` 与 `pack` 必须同族，否则候选无法批准且不会注入提示。

## 管理

设置页 → **改进** → **自动同意**：

- 查看候选、证据数量、脱敏诊断和最近检查记录；
- 达证据阈值后自动同意（写入 `approvedBy=auto-agree`）；
- 运维类建议仅展示，不改命题规则；
- 可停用已自动同意规则。

生产环境必须配置 `MPG_ADMIN_TOKEN`；所有管理 Server Function 均经过 `assertAdminAccess()`。

### 库内「验证试卷」学习（与命题共用候选池）

`validateAndPersistExamQuality`（试卷详情 → 验证试卷）：

1. **展示卫生（确定性）**：若 `qualityRemediation.displayHygieneOnValidate.enabled`（默认开），先对题目跑与**生成入库 / 导入入库**相同的 `repairExamQuestionPayloadStringsWithLearningSync`（内含定界/残片/化学下标/代码围栏）；`persistRepairs` 时有 diff 则写回卷库。**不用 AI 猜排版**。规则是表驱动正则（代码评审入库），不是按卷号硬编码；「改进」只学 `display.*` 提示策略，不自动改正则。
2. 再跑与命题相同的 `collectParsedQuestionsIssues` / 语义闸门；修后仍命中的展示残片记入报告（`display.latex_delimiter` / `display.markup_debris` / `display.code_fence`）。默认 `failOnUnhealed: false` → 仅 warning，不单独导致无法布置；语义 blocking 仍照常 fail。
3. 当 `learningFromValidate.enabled` 且报告有问题（含 pass 下的 display warning）时，按已有 issueCode 写入学习事件；达阈值后 `prompt_policy` 注入后续命题（禁止裸 `$$`、代码须 fence 等）。
4. 「修复问题题」成功/部分成功时按原问题码记 `repaired` / `observed`；修题 prompt 注入同 scope 已批准策略（`injectHintsOnRegenerate`）。

关闭学习：`learningFromValidate.enabled: false`。关闭验证时展示修复：`displayHygieneOnValidate.enabled: false`。

### 自主优化闭环

1. 命题/配图校验失败，或库内验证失败 → 写入 `events.jsonl`（最近检查记录）；
2. 聚合为候选（`state.json`）；
3. `autoAgree.reevaluateOnRecord` / `reevaluateOnRead` 触发自动同意；
4. 下次同 scope 生成 / 库内修题读取已同意的 `prompt_policy` 注入提示；
5. 持续失败会提高证据计数；已同意规则持续生效直至停用。

## 已知边界

- 本地 `state.json` 是运行时规则的权威来源（未配置云端也持久生效）；配置 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 后，事件与候选会自动镜像落库到 `generation_learning_events` / `generation_learning_candidates`（`src/lib/generationLearningDb.server.ts`，best-effort，失败只告警不阻断）。落库需先执行迁移（设置页「执行迁移」或 `npm run db:apply`），含 `20260718150000_generation_learning_force_approved.sql`。
- 候选目前只产生白名单 prompt 策略，不会自动产生新的渲染器或学科知识。
- “通过校验”表示通过现有验证器，不等于所有开放性题目都获得事实级正确性证明。
