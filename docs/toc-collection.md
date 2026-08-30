# 全版本 TOC 采集表与 textbook-directory 字段对照

面向「年级 × 学科 × 版本」全量采集（与课件一览分母一致，当前 **468** 槽）。  
采集表只收**单元目录名**，不收录课文全文 / PDF。

## 1. 采集表文件

| 文件 | 说明 |
|------|------|
| [`data/grade-fills/toc-collection-all-slots.csv`](../data/grade-fills/toc-collection-all-slots.csv) | 全槽位采集底表（由课标枚举生成） |
| [`data/textbook-directory.authoritative.json`](../data/textbook-directory.authoritative.json) | 权威清单（写入目标） |
| [`examples/v1/textbook-directory.shell.json`](../examples/v1/textbook-directory.shell.json) | 空壳模板（仅元数据） |

重新生成空采集表（不覆盖已填内容时请先备份）：

```bash
npm run textbook-directory:toc-collection
```

按单一年级导出待填（仍推荐日常用）：

```bash
npm run textbook-directory:grade-export -- --grade pri_g2_s1
```

填完后写回：

```bash
npm run textbook-directory:grade-apply -- --file data/grade-fills/pri_g2_s1.csv
# 或对全表：将 toc-collection 中已填行整理为同结构 CSV 后 apply
npm run textbook-directory:validate -- --file data/textbook-directory.authoritative.json
```

## 2. 采集表列说明

| 采集列 | 必填 | 含义 | 填法 |
|--------|------|------|------|
| `bookId` | 是（勿改） | 册次主键 | 已预填，格式见下 |
| `gradeBaseId` | 是（勿改） | 年级底座 | 如 `pri_g1` / `jhs_g1` / `hs_g1` |
| `semester` | 是（勿改） | 册次 | `s1` 上 / `s2` 下 |
| `gradeLabel` | 只读 | 年级中文 | 便于人工认格 |
| `subjectId` | 是（勿改） | 学科 id | 如 `math` `chinese` `english` |
| `subjectLabel` | 只读 | 学科中文 | |
| `editionId` | 是（勿改） | 版本 id | 如 `pep` `bnup` `jsph` `waiyan` `yilin` `kexue` |
| `editionLabel` | 只读 | 版本中文 | 人教版 / 北师大版… |
| `title` | 建议保留 | 册正式名 | 可按教材封面微调 |
| `status` | 建议 | 采集状态 | `pending` / `draft` / `verified` |
| `sourceUrlOrBook` | 建议 | 来源 | 智慧教育链接、书名 ISBN、或「纸质书 2024 秋」 |
| `editionYear` | 建议 | 版次/学年 | 如 `2024秋` `2025春`，便于判断是否最新 |
| `unitLabels` | **核心** | 单元目录 | 真实单元名，`\|` 分隔；禁止「第一单元」 |
| `notes` | 可选 | 备注 | 换版说明、缺页等 |

### `bookId` 规则（与运行时一致）

```text
{editionId}-{subjectId}-{gradeBaseId}-{semester}
```

示例：`pep-math-pri_g2-s1` → 人教版 · 数学 · 小学二年级 · 上册。

### `unitLabels` 示例

```text
长度单位|100 以内的加法和减法（二）|角的初步认识|表内乘法（一）|观察物体（一）|表内乘法（二）|认识时间|数学广角-搭配（一）|总复习
```

写入后会生成：

```json
"units": [
  { "id": "pep-math-pri_g2-s1-u1", "label": "长度单位" },
  { "id": "pep-math-pri_g2-s1-u2", "label": "100 以内的加法和减法（二） }
]
```

`units[].id` 由工具按 `{bookId}-u{n}` 自动生成，采集表不必手写。

## 3. 与 `textbook-directory` JSON 字段对照

权威/运行时文件形态：

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "note": "…",
  "source": "…",
  "textbooks": [ /* TextbookBook[] */ ]
}
```

| JSON 路径 | 类型 | 采集表来源 | 说明 |
|-----------|------|------------|------|
| `version` | number | （固定 1） | 清单格式版本 |
| `updatedAt` | string | apply/同步时写入 | |
| `note` / `source` | string | 可选汇总 | 可写「toc-collection」「智慧教育核录」 |
| `textbooks[].id` | string | `bookId` | 主键，禁止手改乱编 |
| `textbooks[].editionId` | string | `editionId` | 须在课标 `editions` 内 |
| `textbooks[].subjectId` | string | `subjectId` | 须在课标 `subjects` 内 |
| `textbooks[].gradeBaseId` | string | `gradeBaseId` | 须在课标 `gradeBases` 内 |
| `textbooks[].semester` | `s1`\|`s2`\|`year` | `semester` | 采集表用 s1/s2 |
| `textbooks[].title` | string | `title` | 展示名 |
| `textbooks[].units[]` | array | `unitLabels` 拆分 | **非空且非占位**才算「已同步」 |
| `textbooks[].units[].id` | string | 自动生成 | `{bookId}-u{n}` |
| `textbooks[].units[].label` | string | `unitLabels` 每一段 | 真实单元名 |
| `textbooks[].units[].lessons` | 可选 | （本表不采） | 需要课时级时再扩展 |

类型定义见：`apps/web/src/lib/curriculumCatalog.types.ts` → `TextbookBook` / `TextbookUnit`。

### 状态列（采集用）与产品「已同步」

| `status`（采集） | 产品一览 |
|------------------|----------|
| `pending` 且 `unitLabels` 空 | 未同步 |
| `draft` 且已填 `unitLabels` | 可同步为已同步（建议仅自用） |
| `verified` 且已填 | 推荐作为生产权威 |

产品「已同步」硬条件：该册 `units.length > 0` 且通过 `unitsLookLikePlaceholders`（拒绝「第一单元」等）。

## 4. 主流版本 id 速查

与 `DIRECTORY_SYNC_CORE_EDITIONS` 一致：

| editionId | 常见名称 |
|-----------|----------|
| `pep` | 人教版 / 统编（语数等） |
| `bnup` | 北师大版 |
| `jsph` | 苏教版 |
| `waiyan` | 外研版 |
| `yilin` | 译林版 |
| `kexue` | 教科版 |

某学科不适用某版本时，课标枚举**不会生成该行**（表中无行 = 无需采集）。

## 5. 建议采集流程（全版本、不缩窄）

1. 用智慧教育教材 / 纸质新书，按 `editionYear` 核对是否现行。  
2. 只填 `unitLabels` + `status` + `sourceUrlOrBook` + `editionYear`。  
3. **勿改** `bookId` / 四个 id 字段。  
4. 按年级或按学科分批 `grade-apply` → `validate` → 设置「获取最新」。  
5. 换版时：只重填该 `bookId` 行并提高 `editionYear`，再 apply 覆盖。

## 6. 交给录入/数据商时的最小交付物

- 填好的 CSV（至少：`bookId` + `unitLabels` + `editionYear` + `status=verified`）  
- 或直接交付与上表同构的 `textbook-directory.json`  
- 可选：HTTPS 托管地址 → 填入设置「远程 HTTPS JSON」
