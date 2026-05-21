# 试卷与卷面资源：通用规则（项目级规范）

**效力**：本文件为 Math Paper Generator 在「试卷结构、图片地址、图片序号/标签」上的**整体规范**。实现以仓库代码与测试为准；新增逻辑须符合本文，不得以单卷特例例外（除非写入可配置层，见下文）。

**范围**：`apps/web/src/lib`、入库/导入脚本、CI 夹具命名与 golden 语义。  
**不在范围**：产品模式文案（如命题页「专项训练」）、JSON Schema 字段名、数据库列名。

---

## 1. 总则

| 允许 | 禁止 |
|------|------|
| 描述**结构类型**（共图大题 + 小问、选择题选项图、坐标系题干） | 绑定**某一卷、某一题号、某一地区卷**（如「仅第 24 题」「上海卷专用」） |
| 描述**错误类别**（△ 误识为 4、选项图 slug 含 `opt-A`） | 写死**整段纸面题干、固定顶点坐标、固定两张图** |
| **运行时**根据题干/题型/`figure_dependency` 决定配图 **0～N 张** | 常量假定「每题 2 图」「必有 `0.jpg` + 图①图②」 |
| 可配置补丁（`data/`、DB 词典、运维 JSON） | 在源码中为单卷增加 `if (examId …)` / `replace(固定纸面文本)` |

**原则**：规则回答「这类题/这类 OCR 错怎么修」，不回答「2024 某某卷第几题怎么修」。

---

## 2. 试卷结构规则

- **题号**：检测用通用锚点（如两位数 `(nn)` 大题根号 + `(1)…(19)` 小问），**不得**写死 `24`、`25` 等作分支条件。
- **题型**（`QuestionType`）：决定选项数组、配图角色（`figure_dependency.figure_role`）、是否走 `by_option` 等；**不得**在导入/对齐逻辑里把共图大题一律改成固定题型，应保留或按结构推断。
- **展开/对齐**：`importParentQuestionTopology` → `align` / `expand` 只依赖拓扑与正文切分，**不得**用固定模板替换用户正文。
- **专规脚本名**：不得新增 `*q24*`、`*shanghai*` 等暗示单卷的模块/CLI 名。

---

## 3. 图片地址规则

- **持久化形态**：`/import-figures/<batch-uuid>/…` 或 `/offline-import/…`；`batch` 来自导入会话，**不得**写死某一 batch id。
- **文件名 slug**：由裁剪管线或 Markdown 产生（如 `p0-图①.png`、`p0-opt-A-1.png`）；匹配时用语义片段（`图${label}`、`opt-${letter}`），**不得**写死完整 URL 列表或 `p0-q24-*` 类题号 slug。
- **分配**：`assignImportedQuestionRasterFromFigurePool` 一类逻辑按 **题干 Markdown、图① 类标签、题型、图池** 合并；**不得**给每题硬编码 URL 数组。
- **整页回退**：`0.jpg` 仅作「题干依赖扫描图且尚无裁图」时的回退，**不得**默认给所有题挂整页。
- **坏链**：`example.com` 等替换为本 batch 整页或剔除，规则通用，不绑卷面。

---

## 4. 图片序号 / 标签规则

- **序号来源**：以题干/选项中的 **「图①」「图②」、Markdown 图、选项图** 为准；**不得**假定全局固定 2 张或固定顺序表。
- **匹配**：`matchImportFigureUrlForDiagramLabel` 等用标签在 URL 中查找，**不得**用题号 `q24` 作为匹配条件。
- **registry / provenance**：`provenance_id` 由 URL 路径解析（ASCII slug 或 `page_0.full`），**不得**用「第 24 题第 1 图」硬编码 id。
- **数量**：`raster_figures.stem` / `by_option` 长度随内容与图池变化；bench golden 描述**观测结果**，不定义「法定必须 3 张」。

---

## 5. 可配置层（单卷差异放这里）

| 载体 | 用途 |
|------|------|
| `data/ocr-repair-lexicon.json` | 字面/正则 OCR 补丁 |
| `data/remote-paper-catalog.json` | 历年卷清单与正文来源 |
| MySQL / Supabase `ocr_repair_lexicon` | 运维追加修复规则 |
| `tests/fixtures/**` | 回归样本（可用真实片段，**夹具目录名**表拓扑/失败类，不表题号） |

**禁止**：为某一卷在 `src/lib` 增加仅该卷使用的替换表或 URL 表。

---

## 6. 测试与治理夹具

- 夹具 **input** 可有 `(22)` 等样例题号，但 **case_id** 须表类型（如 `parent-question-double-figure`），不表 `q24-double-figure`。
- **expected golden** 记录 sanitize 后的观测指标，不编码「法定题数/法定图数」为产品规则。
- 导入图链 constitution：`docs/governance/`（RFC、corpus、taxonomy）；本文件为其**上位**试卷/图资源规范。

---

## 7. 审查清单（PR / Agent）

### 自动自检（推荐）

仓库根或 `apps/web` 下执行：

```bash
npm run governance:generic-exam-content
```

扫描 `apps/web/src/lib`、`apps/web/scripts`（跳过 `*.test.ts`）及 import-pipeline corpus 目录名；命中专规模式则非 0 退出。单行豁免：上一行或同行写 `// @generic-exam-policy-allow: <原因>`。

CI：`.github/workflows/import-pipeline-governance.yml` 已包含本步骤。

### 人工核对（新增/修改须满足）

1. 是否出现 `q24`、`Q24`、`上海卷`、写死 `(24)` 触发？→ 改为结构/标签驱动或迁入 data 词典。
2. 是否写死图片 URL、固定 `stem.length === 2`、固定图①图② 数组？→ 改为从 `content`/`options`/图池推导。
3. 是否用题号命名模块、脚本、夹具？→ 改为拓扑或 taxonomy 名。
4. 单卷特例是否可放进 `ocr-repair-lexicon`？→ 是则不放 `src/lib`。
5. **EPL packing / 图角色 / debug**：是否用题号或「某卷样例」触发规则？→ 须改为结构类型（QWF、`supportive`、`appendix_only`、transform 名）；见 [COGNITIVE-PACKING-FIDELITY-v1.md](COGNITIVE-PACKING-FIDELITY-v1.md)、[PACKING-STABILIZATION-CHECKLIST.md](PACKING-STABILIZATION-CHECKLIST.md)。

---

## 8. EPL 认知呈现与 packing（通用 · 与导入专规正交）

| 允许 | 禁止 |
|------|------|
| 按 **cognitive group role**、**figure label 类型**（`图N` / `附图`）、**placement** 推导 | `if (questionNumber === 24)`、`q24-*` 脚本/夹具名 |
| Train 3 **topology-preserving** transform（见 packing 宪法表） | 为「像某份原卷」在 runtime 内 regroup / reorder |
| `?packing_debug=1` 投影可解释性（非 governance truth） | 将 debug DOM 或目视 checklist 冻进 parity snapshot |

**原则**：packing、figure role、observational confinement 与 [ECR-RUNTIME-CONSTITUTION-v1.md](ECR-RUNTIME-CONSTITUTION-v1.md) 同样适用于**全部**走 EPL 的题面，不是某一卷的 stabilization 专规。

---

## 9. 相关文档

- 导入修复细则（本规范的子集）：[import-generic-rules-policy.md](import-generic-rules-policy.md)
- 导入图链 governance 索引：[README.md](README.md)
- EPL packing / stabilization：[COGNITIVE-PACKING-FIDELITY-v1.md](COGNITIVE-PACKING-FIDELITY-v1.md)、[PACKING-STABILIZATION-CHECKLIST.md](PACKING-STABILIZATION-CHECKLIST.md)
- Agent 入口：`AGENTS.md`（仓库根）
