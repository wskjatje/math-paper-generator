# 试卷导入：版面结构化与图文绑定（路线图）

面向「扫描数学卷」：**仅 OCR 文本无法恢复图示选项**；必须在像素层做 **Layout → Figure Association → 裁剪入库 → Markdown 随正文交给 AI**。

## 坐标契约

- **bbox**：优先 **归一化** `[x, y, w, h]`，各分量 ∈ `[0,1]`，相对**当前页原图**宽高；服务端 `offlineImportDiagramCrops` 亦兼容 `[x1,y1,x2,y2]` 像素。
- **pageIndex**：与 `import-figures/<batch>/<imageIndex>.jpg` 一致。
- **questionIndex**：卷面题号（正整数），与题干 `(1)`、`第1题` 对齐。

## 分层（落地顺序）

| 阶段 | 内容 | 仓库状态 |
|------|------|----------|
| P0 | 整页入库：`extractPdfTextAndRenderPagesAsJpeg` + `![](/import-figures/…)` | 已实现 |
| P1 | **启发式**连通域 → 粗 bbox → 裁剪 persist → 合并正文 Markdown | **本阶段代码** |
| P2 | 网关/服务端 DocLayout、PP-Structure、`diagram_links` 精准 bbox | `gatewayAdapter` 合并顶层/layout/meta 的 `diagram_links`、`questions[].diagrams` 补 bbox、`option_diagram_links` |
| P3 | 选项标签 `(A)`… 与邻接图块几何配对、写入 `options[]` 结构化字段 | `optionDiagramInference.shared.ts` 几何推断；`reconcileOptionFigureMarkdownIntoMcqOptions` 把 `-opt-A-` 附图写入 MCQ `options[]` |

## P1 启发式规则（当前实现）

在 **无网关结构化 OCR** 或 **未返回 diagram 块** 时，对整页 JPEG：

1. 降采样 → 二值化 → **8 连通域**，过滤面积与宽高比。
2. 按卷面 OCR 文本解析首个题号 `(1)`…（默认同页首题）。
3. **侧栏主图**：页面右半区、面积较大的连通块 → `stem`。
4. **选项行**：页面下方带状区域内 **4 个**面积相近的小块，按 **从左到右** → A–D。

规则对复杂跨栏 / 一页多题会退化；此时仍保留整页 `![](…)`，并以控制台级警告提示。

## 集成点

- 浏览器：`paperLayoutImport/heuristicExamPageLayout.browser.ts`
- 导入对话框：`ImportOfflineExamDialog.tsx` 在 `persistFigures` 之后、`diagramMdByImgIndex` 填充逻辑中与网关裁图 **互补**（已有网关结果则跳过启发式）。
- 服务端裁剪：`persistOfflineImportDiagramCrops`（已有）

## 后续（P2/P3）

- 引入 DocLayout-YOLO / PP-Structure **text / figure / option** 类别。
- `diagram_links` 题号—bbox 硬绑定优先于启发式。
- 题库模型扩展 `option_figure_urls: string[] | null`（或与 Markdown 选项长期并存）。
