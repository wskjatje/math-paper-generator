# 讲义能力档方案 v1（拍板落地）

状态：**已拍板并落地**（无硬编码单卷、无瞎猜能力档、fail closed）。

## 拍板要点

1. **多选能力档，默认 L2**  
   一键生成支持 `bandIds`（兼容旧 `bandId`）。空选回落配置键 `defaultAbilityBandId`（现为 `L2`），须存在于 `abilityBands`。非法 id → 拒生成（`bandIdInvalid` / `defaultBandMissing`）。高级区多选；初始仅勾选默认档。

2. **L1 生活类比闸门**  
   `abilityBands[].requireLifeAnalogy=true` 时，口播须命中 `handoutGeneration.lifeAnalogyMarkers`（如「比如」）；否则 `gateExplainScript` 失败（`analogyRequired`）。标记与文案只进配置，禁止源码臆造。

3. **学生档案绑档发放**  
   本机 `local_accounts.explain_ability_band_id`（可空=未绑定）。运维创建/编辑学生可选「讲解能力档」；填写则须为配置内 band id。

## 发放解析规则（`resolveExplainPlayForStudent`）

对匹配 `sourceExamId` + `sourceQuestionId` 且 `status=ready` 的练习包：

1. 优先：`bandId ===` 学生档案绑档（入参 `studentBandId` / `studentExplainBandId`）  
2. 否则：`bandId === defaultAbilityBandId` 的 ready 包  
3. 否则：任意同题 ready 包  
4. 皆无 → 返回空 + `explainBandUnresolved`（fail closed）

学生绑档 id 非法 → `bandIdInvalid`（禁止猜档）。

## 相关配置与入口

- 配置：`apps/web/src/config/explain-video.json`（`abilityBands` / `defaultAbilityBandId` / `handoutGeneration.bandOverlays` / `lifeAnalogyMarkers` / `messages.*`）
- 一键：`runExplainOneClickFromExam` / `FromTypeSpec`（`bandIds`）
- 发放：`resolveExplainPlayForStudent` / `resolveExplainPlaysForStudentExam`（学生作业页只播，不生成）
- 列 ensure：`mysqlAccountStore.server.ts`（`ALTER … ADD COLUMN`，忽略 1060）；`local_accounts` 不在 `zhixue_schema.sql`，见 `mysqlSchemaApply.server.ts` 注释
