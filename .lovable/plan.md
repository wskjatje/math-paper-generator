# 开源竞赛试卷与例题生成平台

## 一、产品定位

一个**完全开放、无需登录**的 AI 驱动平台，用于生成高质量的数据竞赛、奥数及交叉学科（统计学、编程、物理、化学）试卷与配套例题。所有内容开源、可下载、含详细推导步骤。

## 二、核心功能（首版范围）

### 1. 预置试卷库（浏览/筛选/下载）

- 内置一批已生成并校验过的高质量试卷（按学科、难度、年份分类）
- 支持按学科 / 难度 / 题型筛选
- 详情页展示完整试题 + 详细解题步骤 + 逻辑推导
- 支持 Markdown / PDF 下载

### 2. 自定义生成（Lovable AI 驱动）

用户在配置面板选择：

- **学科组合**（多选）：奥数(代数/几何/数论/组合)、数据科学与统计、编程算法、数学物理、数学化学
- **难度等级**：入门 / 进阶 / 竞赛 / 高阶竞赛
- **题型组成**：选择题 / 填空题 / 解答题 / 编程题 / 证明题（每类数量）
- **总分与时长**

生成流程（两阶段，确保严谨性）：

1. **试卷生成**：调用 Lovable AI（`google/gemini-2.5-pro` + `reasoning: high`），结构化输出整套试卷 JSON（题干、答案、详细推导步骤、知识点标签）
2. **例题生成**：基于试卷中每个题型，再次生成 1-2 道同类型"例题"（含完整步骤），便于学习者理解该题型解法范式

### 3. 试卷展示与导出

- KaTeX 渲染数学公式
- 代码块高亮（编程题）
- 化学方程式 / 物理公式渲染
- "显示/隐藏答案" 切换
- 一键复制 / 下载 Markdown / 打印为 PDF

## 三、技术架构

### 技术栈

- **前端**: TanStack Start + React 19 + Tailwind v4 + shadcn/ui
- **后端**: Lovable Cloud (Postgres + Edge Functions)
- **AI**: Lovable AI Gateway（双阶段生成 + 工具调用结构化输出）
- **数学渲染**: KaTeX (`react-katex`)
- **代码高亮**: `react-syntax-highlighter`

### 数据模型（Lovable Cloud）

```
exams 表
  id, title, subjects[], difficulty, duration_min, total_score,
  created_at, is_featured, source ('curated'|'generated')

questions 表
  id, exam_id, order, type, subject, content (md+latex),
  answer, solution_steps (jsonb 数组：每步 {description, reasoning, formula}),
  knowledge_tags[], points

examples 表（配套例题）
  id, exam_id, question_id, content, answer, solution_steps, difficulty
```

### Edge Functions

- `generate-exam`：第一阶段，调用 Lovable AI 生成完整试卷（tool calling 结构化输出 + reasoning 模式）
- `generate-examples`：第二阶段，针对试卷中各题型生成配套例题
- 内置严谨 system prompt，要求每道题必须给出**步骤化推导**，并在生成后做轻量自校验（让模型审核一遍再返回）

### 路由

```
/              首页（介绍 + CTA + 精选试卷）
/library       试卷库（筛选/搜索）
/exam/$id      试卷详情（题目 + 答案 + 步骤 + 例题）
/generate      自定义生成配置页
/about         关于（开源声明、使用说明）
```

## 四、设计方向

**学术权威 + 现代极简**：

- 配色：深墨蓝主色 + 学术金点缀 + 米白底（区别于通用 SaaS 蓝紫）
- 字体：标题用衬线（Cormorant / Crimson Pro）体现学术感，正文用 Inter，公式 KaTeX 默认
- 关键视觉：首页 hero 用数学符号/公式背景纹理，卡片采用纸张质感（细微阴影 + 边框）
- 强调"严谨""可验证""开源"的氛围

## 五、实施步骤

1. 启用 Lovable Cloud
2. 建立 design system（深墨蓝学术风 tokens、字体、卡片/按钮变体）
3. 建立数据库 schema + 公开读 RLS
4. 创建路由骨架（首页 / 库 / 详情 / 生成 / 关于）
5. 实现 KaTeX + 代码高亮的题目渲染组件
6. 实现 `generate-exam` edge function（Lovable AI + 结构化工具调用 + reasoning）
7. 实现 `generate-examples` edge function
8. 实现生成配置页 + 流式状态反馈
9. 试卷详情页（题目、答案折叠、例题区、下载按钮）
10. 试卷库页（筛选 + 卡片网格）
11. 种子数据：内置 3-5 套精选试卷作为示例
12. Markdown 导出功能

## 六、注意事项与边界

- **首版聚焦"生成 + 浏览 + 导出"主链路**，不做用户系统、收藏、评论等
- AI 生成质量依赖 prompt 工程；首版用 reasoning=high 保障严谨度，但单次生成耗时较长（30-90s），需做好流式/进度提示
- 化学结构式、复杂物理图示首版以 LaTeX 公式为主，不做矢量图渲染
- PDF 导出首版用浏览器打印（`window.print()` + 打印样式），后续可升级为 server 端生成
- 速率限制（429）与额度耗尽（402）需在前端 toast 友好提示

---

请确认是否按此方案开工？或者你希望调整某些部分（例如先只做"生成"或先只做"试卷库"，缩小首版范围以更快看到效果）。
