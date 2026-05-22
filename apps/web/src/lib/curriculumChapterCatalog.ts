/**
 * 校内同步「章节范围」可选目录：按年级学段（小学/初中/高中）+ 学科筛选。
 * id 稳定入库；展示名用于序列化 `chapter_focus` 与队列回填。
 */
import { gradeBand, type GradeBand } from "@/lib/generateCatalog";

export type ChapterCatalogEntry = {
  id: string;
  label: string;
  group: string;
};

type ChapterBand = GradeBand | "all";

type RawChapter = {
  subject: string;
  id: string;
  label: string;
  group: string;
  bands: readonly ChapterBand[];
};

/** 扁平目录：学段过滤见 {@link chapterCatalogEntriesForGradeSubject} */
const RAW_CHAPTERS: RawChapter[] = [
  // —— 数学 · 小学 ——
  {
    subject: "math",
    id: "math.p.num.a",
    label: "100 以内数的认识与加减",
    group: "数与代数（小学）",
    bands: ["primary"],
  },
  {
    subject: "math",
    id: "math.p.mul",
    label: "表内乘除与解决问题",
    group: "数与代数（小学）",
    bands: ["primary"],
  },
  {
    subject: "math",
    id: "math.p.frac",
    label: "分数初步认识",
    group: "数与代数（小学）",
    bands: ["primary"],
  },
  {
    subject: "math",
    id: "math.p.geom.shape",
    label: "认识图形（线与角）",
    group: "图形与几何（小学）",
    bands: ["primary"],
  },
  {
    subject: "math",
    id: "math.p.geom.measure",
    label: "测量与单位换算",
    group: "图形与几何（小学）",
    bands: ["primary"],
  },
  {
    subject: "math",
    id: "math.p.stat",
    label: "统计与可能性",
    group: "统计与概率（小学）",
    bands: ["primary"],
  },
  // —— 数学 · 初中 ——
  {
    subject: "math",
    id: "math.j.rational",
    label: "有理数",
    group: "数与代数（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.algebra",
    label: "整式与方程（组）",
    group: "数与代数（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.func",
    label: "函数初步（一次函数）",
    group: "数与代数（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.quad",
    label: "二次函数与方程",
    group: "数与代数（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.geom.tri",
    label: "三角形与全等相似",
    group: "图形与几何（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.geom.circle",
    label: "圆与几何证明",
    group: "图形与几何（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.stat",
    label: "统计与概率（初中）",
    group: "统计与概率（初中）",
    bands: ["junior"],
  },
  {
    subject: "math",
    id: "math.j.applied",
    label: "综合与实践 / 应用题综合",
    group: "综合（初中）",
    bands: ["junior"],
  },
  // —— 数学 · 高中 ——
  {
    subject: "math",
    id: "math.s.set",
    label: "集合与常用逻辑用语",
    group: "必修 · 预备",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.func",
    label: "函数概念与性质",
    group: "必修 · 函数",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.trig",
    label: "三角函数与恒等变换",
    group: "必修 · 函数",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.vector",
    label: "平面向量",
    group: "必修 · 几何",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.seq",
    label: "数列",
    group: "选择性必修",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.derivative",
    label: "导数及其应用",
    group: "选择性必修",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.analytic",
    label: "解析几何（直线与圆锥曲线）",
    group: "选择性必修",
    bands: ["senior"],
  },
  {
    subject: "math",
    id: "math.s.prob",
    label: "计数原理与概率统计",
    group: "选择性必修",
    bands: ["senior"],
  },
  // —— 语文 · 小学 ——
  {
    subject: "chinese",
    id: "cn.p.pin",
    label: "拼音与识字写字",
    group: "语言文字运用（小学）",
    bands: ["primary"],
  },
  {
    subject: "chinese",
    id: "cn.p.read",
    label: "课文阅读与朗读",
    group: "阅读（小学）",
    bands: ["primary"],
  },
  {
    subject: "chinese",
    id: "cn.p.write",
    label: "写话 / 习作入门",
    group: "写作（小学）",
    bands: ["primary"],
  },
  // —— 语文 · 初中 ——
  {
    subject: "chinese",
    id: "cn.j.lang",
    label: "语言文字运用综合",
    group: "语言文字运用（初中）",
    bands: ["junior"],
  },
  {
    subject: "chinese",
    id: "cn.j.modern",
    label: "现代文阅读",
    group: "阅读（初中）",
    bands: ["junior"],
  },
  {
    subject: "chinese",
    id: "cn.j.classical",
    label: "古诗文阅读",
    group: "阅读（初中）",
    bands: ["junior"],
  },
  {
    subject: "chinese",
    id: "cn.j.write",
    label: "写作与综合性学习",
    group: "写作（初中）",
    bands: ["junior"],
  },
  // —— 语文 · 高中 ——
  {
    subject: "chinese",
    id: "cn.s.info",
    label: "信息类文本阅读",
    group: "必修 · 阅读",
    bands: ["senior"],
  },
  {
    subject: "chinese",
    id: "cn.s.literature",
    label: "文学类文本阅读",
    group: "必修 · 阅读",
    bands: ["senior"],
  },
  {
    subject: "chinese",
    id: "cn.s.classical",
    label: "文言文阅读",
    group: "必修 · 阅读",
    bands: ["senior"],
  },
  {
    subject: "chinese",
    id: "cn.s.compose",
    label: "作文与微写作",
    group: "必修 · 写作",
    bands: ["senior"],
  },
  // —— 英语 · 小学 ——
  {
    subject: "english",
    id: "en.p.alpha",
    label: "字母与基础词汇",
    group: "语言知识（小学）",
    bands: ["primary"],
  },
  {
    subject: "english",
    id: "en.p.read",
    label: "简短对话与阅读",
    group: "阅读（小学）",
    bands: ["primary"],
  },
  // —— 英语 · 初中 ——
  {
    subject: "english",
    id: "en.j.grammar",
    label: "语法与句型",
    group: "语言知识（初中）",
    bands: ["junior"],
  },
  {
    subject: "english",
    id: "en.j.read",
    label: "阅读理解",
    group: "阅读（初中）",
    bands: ["junior"],
  },
  {
    subject: "english",
    id: "en.j.write",
    label: "书面表达",
    group: "写作（初中）",
    bands: ["junior"],
  },
  // —— 英语 · 高中 ——
  {
    subject: "english",
    id: "en.s.lang",
    label: "词汇与语法综合运用",
    group: "语言知识（高中）",
    bands: ["senior"],
  },
  {
    subject: "english",
    id: "en.s.read",
    label: "阅读理解与七选五",
    group: "阅读（高中）",
    bands: ["senior"],
  },
  {
    subject: "english",
    id: "en.s.write",
    label: "读后续写 / 应用文",
    group: "写作（高中）",
    bands: ["senior"],
  },
  // —— 物理 ——
  {
    subject: "physics",
    id: "ph.j.mechanics",
    label: "力学（运动与力）",
    group: "初中物理",
    bands: ["junior"],
  },
  {
    subject: "physics",
    id: "ph.j.em",
    label: "简单电路与电磁现象",
    group: "初中物理",
    bands: ["junior"],
  },
  {
    subject: "physics",
    id: "ph.s.mechanics",
    label: "力学综合",
    group: "高中物理 · 必修",
    bands: ["senior"],
  },
  {
    subject: "physics",
    id: "ph.s.em",
    label: "电磁学",
    group: "高中物理 · 必修选择性必修",
    bands: ["senior"],
  },
  {
    subject: "physics",
    id: "ph.s.optics",
    label: "光学与近代物理初步",
    group: "高中物理 · 选择性必修",
    bands: ["senior"],
  },
  // —— 化学 ——
  {
    subject: "chemistry",
    id: "ch.j.basic",
    label: "物质构成与化学方程式",
    group: "初中化学",
    bands: ["junior"],
  },
  {
    subject: "chemistry",
    id: "ch.j.acid",
    label: "酸碱盐与金属",
    group: "初中化学",
    bands: ["junior"],
  },
  {
    subject: "chemistry",
    id: "ch.s.struct",
    label: "物质结构与性质",
    group: "高中化学",
    bands: ["senior"],
  },
  {
    subject: "chemistry",
    id: "ch.s.react",
    label: "化学反应原理",
    group: "高中化学",
    bands: ["senior"],
  },
  {
    subject: "chemistry",
    id: "ch.s.org",
    label: "有机化学基础",
    group: "高中化学",
    bands: ["senior"],
  },
  // —— 生物 ——
  {
    subject: "biology",
    id: "bio.j.cell",
    label: "生物与环境（初中综合）",
    group: "初中生物学",
    bands: ["junior"],
  },
  {
    subject: "biology",
    id: "bio.s.cell",
    label: "细胞与分子",
    group: "高中生物学 · 必修",
    bands: ["senior"],
  },
  {
    subject: "biology",
    id: "bio.s.genetics",
    label: "遗传与进化",
    group: "高中生物学 · 必修",
    bands: ["senior"],
  },
  {
    subject: "biology",
    id: "bio.s.eco",
    label: "生态与环境",
    group: "高中生物学 · 选择性必修",
    bands: ["senior"],
  },
  // —— 历史 ——
  {
    subject: "history",
    id: "hist.j.cn",
    label: "中国古代史（初中）",
    group: "初中历史",
    bands: ["junior"],
  },
  {
    subject: "history",
    id: "hist.j.modern",
    label: "中国近现代史与世界史（初中）",
    group: "初中历史",
    bands: ["junior"],
  },
  {
    subject: "history",
    id: "hist.s.cn",
    label: "中外历史纲要",
    group: "高中历史 · 必修",
    bands: ["senior"],
  },
  {
    subject: "history",
    id: "hist.s.topic",
    label: "选择性必修专题史",
    group: "高中历史 · 选必",
    bands: ["senior"],
  },
  // —— 地理 ——
  {
    subject: "geography",
    id: "geo.j.earth",
    label: "地球与地图 · 自然地理基础（初中）",
    group: "初中地理",
    bands: ["junior"],
  },
  {
    subject: "geography",
    id: "geo.j.region",
    label: "人文地理与区域地理（初中）",
    group: "初中地理",
    bands: ["junior"],
  },
  {
    subject: "geography",
    id: "geo.s.natural",
    label: "自然地理基础",
    group: "高中地理 · 必修选择性必修",
    bands: ["senior"],
  },
  {
    subject: "geography",
    id: "geo.s.human",
    label: "人文地理 · 区域发展",
    group: "高中地理 · 必修选择性必修",
    bands: ["senior"],
  },
  // —— 思想政治 / 道法 ——
  {
    subject: "morality",
    id: "mo.j.self",
    label: "成长中的我与法治国情（初中道法）",
    group: "初中道德与法治",
    bands: ["junior"],
  },
  {
    subject: "politics",
    id: "pol.s.econ",
    label: "经济与社会",
    group: "高中思想政治 · 必修",
    bands: ["senior"],
  },
  {
    subject: "politics",
    id: "pol.s.political",
    label: "政治与法治",
    group: "高中思想政治 · 必修",
    bands: ["senior"],
  },
  {
    subject: "politics",
    id: "pol.s.philo",
    label: "哲学与文化",
    group: "高中思想政治 · 必修选必",
    bands: ["senior"],
  },
  // —— 科学（小学综合） ——
  {
    subject: "science",
    id: "sci.p.life",
    label: "生命科学现象",
    group: "小学科学",
    bands: ["primary"],
  },
  {
    subject: "science",
    id: "sci.p.matter",
    label: "物质与简单物理现象",
    group: "小学科学",
    bands: ["primary"],
  },
  {
    subject: "science",
    id: "sci.p.earth",
    label: "地球与宇宙",
    group: "小学科学",
    bands: ["primary"],
  },
  // —— 信息技术 ——
  {
    subject: "it",
    id: "it.j.office",
    label: "信息与办公软件基础",
    group: "初中信息技术",
    bands: ["junior"],
  },
  {
    subject: "it",
    id: "it.j.logic",
    label: "算法与程序设计入门",
    group: "初中信息技术",
    bands: ["junior"],
  },
  {
    subject: "it",
    id: "it.s.data",
    label: "数据与编码",
    group: "高中信息技术",
    bands: ["senior"],
  },
  {
    subject: "it",
    id: "it.s.ai",
    label: "人工智能初步",
    group: "高中信息技术",
    bands: ["senior"],
  },
  // —— 通用复习类（全学段可选用） ——
  {
    subject: "math",
    id: "math.all.review.mid",
    label: "期中复习",
    group: "阶段复习",
    bands: ["all"],
  },
  {
    subject: "math",
    id: "math.all.review.final",
    label: "期末复习",
    group: "阶段复习",
    bands: ["all"],
  },
  {
    subject: "chinese",
    id: "cn.all.review.mid",
    label: "期中复习",
    group: "阶段复习",
    bands: ["all"],
  },
  {
    subject: "chinese",
    id: "cn.all.review.final",
    label: "期末复习",
    group: "阶段复习",
    bands: ["all"],
  },
  {
    subject: "english",
    id: "en.all.review.mid",
    label: "期中复习",
    group: "阶段复习",
    bands: ["all"],
  },
  {
    subject: "english",
    id: "en.all.review.final",
    label: "期末复习",
    group: "阶段复习",
    bands: ["all"],
  },
];

const CHAPTER_BY_ID = new Map<string, RawChapter>(RAW_CHAPTERS.map((r) => [r.id, r]));

export function chapterCatalogEntriesForGradeSubject(
  gradeId: string,
  subjectId: string,
): ChapterCatalogEntry[] {
  if (!gradeId?.trim() || !subjectId?.trim()) return [];
  const band = gradeBand(gradeId);
  if (!band) return [];
  return RAW_CHAPTERS.filter(
    (r) => r.subject === subjectId && (r.bands.includes("all") || r.bands.includes(band)),
  ).map((r) => ({ id: r.id, label: r.label, group: r.group }));
}

export function chapterLabelById(id: string): string | undefined {
  return CHAPTER_BY_ID.get(id)?.label;
}

/** MySQL 目录条目（mysql: 前缀）需通过合并后的条目解析标签 */
export function mergeChapterCatalogEntries(
  mysql: ChapterCatalogEntry[],
  builtin: ChapterCatalogEntry[],
): ChapterCatalogEntry[] {
  if (!mysql.length) return builtin;
  return [...mysql, ...builtin];
}

/** 序列化为入库 `chapter_focus`：章节名用「；」拼接，便于人工读与旧队列兼容 */
export function serializeChapterFocus(
  ids: readonly string[],
  supplement: string,
  resolveLabel?: (id: string) => string | undefined,
): string {
  const labels: string[] = [];
  for (const id of ids) {
    const lab = resolveLabel?.(id) ?? chapterLabelById(id);
    if (lab) labels.push(lab);
  }
  const parts = [...labels];
  const rest = supplement.trim();
  if (rest) parts.push(rest);
  return parts.join("；");
}

function splitFocusSegments(raw: string): string[] {
  return raw
    .split(/[；;，,、]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 从旧版自由文本 `chapter_focus` 尽力还原勾选 id；无法匹配的片段保留为补充说明。
 */
export function parseChapterFocusPrefill(
  raw: string,
  gradeId: string,
  subjectId: string,
): { ids: string[]; supplement: string } {
  if (!raw.trim()) return { ids: [], supplement: "" };
  const entries = chapterCatalogEntriesForGradeSubject(gradeId, subjectId);
  const exact = new Map(entries.map((e) => [e.label, e.id]));
  const segments = splitFocusSegments(raw);
  const ids: string[] = [];
  const unmatched: string[] = [];

  for (const seg of segments) {
    if (exact.has(seg)) {
      const id = exact.get(seg)!;
      if (!ids.includes(id)) ids.push(id);
      continue;
    }
    const fuzzy = entries.find(
      (e) =>
        seg.includes(e.label) ||
        e.label.includes(seg) ||
        seg.replace(/\s/g, "") === e.label.replace(/\s/g, ""),
    );
    if (fuzzy && !ids.includes(fuzzy.id)) ids.push(fuzzy.id);
    else unmatched.push(seg);
  }

  return { ids, supplement: unmatched.join("；") };
}
