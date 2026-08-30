# Crawl4AI 课本目录采集（可选）

将 [Crawl4AI](https://github.com/unclecode/crawl4ai) 接到本仓 **textbook-directory** 流水线：爬取**已获授权**的目录页 → Markdown → 单元列表 CSV → `textbook-directory:grade-apply`。

**不做**：替换命题主路径；不硬编码全书目录进 `src/lib`；不猜 bookId；不在未授权站点默爬。

## 1. 安装（本机一次）

```bash
npm run textbook-directory:crawl4ai:setup
```

会在 `tools/crawl4ai-textbook/.venv` 安装 `crawl4ai` 与 Playwright Chromium。

## 2. 配置任务（可选）

[`tools/crawl4ai-textbook/jobs.json`](../tools/crawl4ai-textbook/jobs.json) 中 **`autoCrawl.enabled` 默认 true**，无需逐册手写任务即可自动补缺：

| 优先级 | 来源 | 行为 |
|--------|------|------|
| 1 | `jobs.json` 中 `enabled: true` | 按指定 URL 爬取 |
| 2 | `data/grade-fills/toc-collection-all-slots.csv` 的 `unitLabels` | 直接写入（不联网） |
| 3 | 采集表 `sourceUrlOrBook` 为 HTTPS | 自动爬取 |
| 4 | `data/smartedu-materials/catalog.json` | 按 `mapped` 匹配册次后爬详情页 |

显式任务字段（可选）：

| 字段 | 含义 |
|------|------|
| `enabled` | 仅 `true` 才会爬 |
| `bookId` | 与采集表一致，如 `pep-math-pri_g2-s1` |
| `sourceUrl` | **已获授权**的目录页 HTTPS |
| `editionId` / `subjectId` / `gradeBaseId` / `semester` | 与 CSV apply 列一致 |
| `markdownHeadingLevels` | 从 Markdown 几级标题抽单元（默认 2,3） |
| `unitLineRegex` | 可选；有捕获组时优先生效 |

示例模板：`jobs.example.json`。示例 URL / `enabled:false` 不会联网。

## 3. 爬取

命令行（运维/调试）：

```bash
npm run textbook-directory:crawl4ai
```

**课件页（推荐）**：设置 → 课件 → 选年级 → **获取课件**。系统会对「未同步且 `jobs.json` 有 enabled 授权任务」的册次自动爬虫补全，再同步目录来源。

产出：

| 路径 | 内容 |
|------|------|
| `data/grade-fills/crawl4ai-out/<jobId>.md` | 页面 Markdown |
| `data/grade-fills/crawl4ai-out/<jobId>.units.json` | 抽出的单元 |
| `data/grade-fills/crawl4ai-out/toc-from-crawl4ai.csv` | 可 apply 的 CSV |

抽不出单元 / 命中「第N单元」占位 → **非 0 退出**（fail closed）。

仅测抽取（不联网）：

```bash
tools/crawl4ai-textbook/.venv/bin/python tools/crawl4ai-textbook/crawl_toc.py \
  --extract-md path/to/sample.md --heading-levels 2,3
```

## 4. 写入权威目录

人工抽检 `units.json` 后：

```bash
npm run textbook-directory:grade-apply -- --file data/grade-fills/crawl4ai-out/toc-from-crawl4ai.csv
npm run textbook-directory:validate -- --file data/textbook-directory.authoritative.json
```

设置 → 课件「目录来源」指向权威清单 → **立即同步**（见 [`textbook-directory.md`](./textbook-directory.md)）。

## 5. 与现网关系

```text
授权目录 URL（jobs.json）
  → Crawl4AI（本工具）
  → Markdown + unitLabels CSV
  → grade-apply → textbook-directory.authoritative.json
  → 设置同步 → 命题章节可选
```

路径 B（机构自建/粘贴）仍可用；Crawl4AI 只是自动化「从授权网页取目录名」的手段。

## 6. 合规

- 仅爬你有权使用的目录页；版权争议站点不要写入 jobs。  
- 只采**单元名**，不落课文全文进权威清单。  
- 换版后须更新 `sourceUrl` 并重新校验。
