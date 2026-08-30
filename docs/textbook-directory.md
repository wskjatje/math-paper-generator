# 教材目录清单（全量覆盖 · 禁止兜底）

命题/运维「按年级册次」进度来自：`textbook-directory` 清单中**含真实 `units`** 的册，叠到生效课件。  
「立即同步」只忠实地写入来源清单，**不会**为缺册造单元。

## 文件约定

| 路径 | 用途 |
|------|------|
| `examples/v1/textbook-directory.sample.json` | 冒烟样例（少量真实纲要） |
| `examples/v1/textbook-directory.shell.json` | **空壳模板**（全槽位、`units: []`，由脚本生成） |
| `data/textbook-directory.json` | 本机同步落盘（运行时） |
| `data/grade-fills/toc-collection-all-slots.csv` | **全版本 TOC 采集表**（年级×学科×版本） |
| HTTPS 或仓库相对路径 | 设置 → 课件「目录来源」 |

全量采集表列说明与 JSON 字段对照见 [`docs/toc-collection.md`](./toc-collection.md)。  
生成/刷新采集表：`npm run textbook-directory:toc-collection`（已有本地纲要可加 `-- --with-existing`）。

## 落地流程（路径 A：机构自建）

```bash
# 1) 按课标枚举生成空壳（无单元，禁止手写 id）
npm run textbook-directory:shell

# 2) 教研在 shell 副本上为每册填入真实单元名（勿用「第一单元」）
#    建议另存为 data/textbook-directory.authoritative.json 或托管 HTTPS

# 3) 校验：拒占位；打印覆盖率（缺册仅观测，默认不失败）
npm run textbook-directory:validate -- --file examples/v1/textbook-directory.shell.json
npm run textbook-directory:validate -- --file path/to/authoritative.json

# 4) 全量门禁（可选，权威清单填满后）
npm run textbook-directory:validate -- --file path/to/authoritative.json --require-full-coverage

# 5) 设置「目录来源」= 权威路径或 HTTPS → 立即同步
```

## 页面操作（最简单）

1. 设置 → 课件 → 选年级  
2. **获取课件**：缺册时**自动**从采集表写入单元、或按采集表/智慧教育目录 URL 爬虫补全，再同步；无来源的仍可手动粘贴  
3. 无自动来源时，点橙色 **未同步** → 粘贴单元名（每行一个）→ **写入目录**

目录来源默认 `data/textbook-directory.authoritative.json`（可在上方填写 HTTPS 或本机路径）。

## 按年级刷学科（推荐日常操作）

每次只处理一个册次（如一年级下 `pri_g1_s2`），把该档下所有空学科×版本导出成 CSV，教研填 `unitLabels` 后再写回。

```bash
# 导出该年级仍为空的册（一行一册；unitLabels 用 | 分隔）
npm run textbook-directory:grade-export -- --grade pri_g1_s2
# → data/grade-fills/pri_g1_s2.csv

# 教研填写后写回权威清单（拒占位）
npm run textbook-directory:grade-apply -- --file data/grade-fills/pri_g1_s2.csv

# 校验 → 设置目录来源 → 立即同步
npm run textbook-directory:validate -- --file data/textbook-directory.authoritative.json
```

年级键：`pri_g1_s1` … `pri_g6_s2`、`jhs_g1_s1` …、`hs_g1_s1` …（与课件一览分母一致）。  
已填过的册默认不导出；加 `--all` 可导出该年级全部册。

## 路径 B / C

- **B**：仅对已获授权的电子教材抽取目录 → 人工抽检 → 同上校验 → 同步。  
  可选自动化：[`docs/textbook-directory-crawl4ai.md`](./textbook-directory-crawl4ai.md)（Crawl4AI → CSV → `grade-apply`）。  
- **C**：托管完整 HTTPS JSON，设置填 URL 后立即同步。

## 验收

- 占位纲要：`validate` 非 0。  
- 空 `units`：同步后该格仍为「未同步」。  
- `--require-full-coverage`：`syncedSlots === expectedSlots` 才通过。
