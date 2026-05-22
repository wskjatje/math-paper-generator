import type { Difficulty, QuestionType } from "@/lib/types";
import { DIFFICULTY_LABELS } from "@/lib/types";

export type GradeBand = "primary" | "junior" | "senior";

/**
 * 学年基准（不含学期）。学段用于限定可选学科；入库标签中的「学年」匹配用 {@link gradeYearLabel}。
 */
const GRADE_BASE_META = [
  { id: "pri_g1", label: "小学一年级", band: "primary" as const satisfies GradeBand },
  { id: "pri_g2", label: "小学二年级", band: "primary" as const satisfies GradeBand },
  { id: "pri_g3", label: "小学三年级", band: "primary" as const satisfies GradeBand },
  { id: "pri_g4", label: "小学四年级", band: "primary" as const satisfies GradeBand },
  { id: "pri_g5", label: "小学五年级", band: "primary" as const satisfies GradeBand },
  { id: "pri_g6", label: "小学六年级", band: "primary" as const satisfies GradeBand },
  { id: "jhs_g1", label: "初一", band: "junior" as const satisfies GradeBand },
  { id: "jhs_g2", label: "初二", band: "junior" as const satisfies GradeBand },
  { id: "jhs_g3", label: "初三", band: "junior" as const satisfies GradeBand },
  { id: "hs_g1", label: "高一", band: "senior" as const satisfies GradeBand },
  { id: "hs_g2", label: "高二", band: "senior" as const satisfies GradeBand },
  { id: "hs_g3", label: "高三", band: "senior" as const satisfies GradeBand },
] as const;

/** 下拉选项：每个学年拆分为上学期（_s1）、下学期（_s2） */
export const GRADE_LEVEL_OPTIONS = GRADE_BASE_META.flatMap((row) => [
  { id: `${row.id}_s1`, label: `${row.label}（上）` },
  { id: `${row.id}_s2`, label: `${row.label}（下）` },
]);

/**
 * 命题页升学 / 竞赛 / 专项模式下列学科但不选校内年级时的占位 id（入库标签见 {@link gradeLevelLabel}）。
 */
export const GEN_GRADE_UNBOUND_ID = "gen_unbound" as const;

export function isGenerationGradeUnbound(gradeId: string | undefined | null): boolean {
  return gradeId === GEN_GRADE_UNBOUND_ID;
}

/** 学年 id → 中文称谓（不含学期），兼容旧入库标签 */
export const GRADE_YEAR_LABELS: Record<string, string> = Object.fromEntries(
  GRADE_BASE_META.map((r) => [r.id, r.label]),
);

/** 课程类学科（语文、数学、生物等） */
export const CURRICULUM_SUBJECT_OPTIONS = [
  { id: "chinese", label: "语文" },
  { id: "math", label: "数学" },
  { id: "english", label: "英语" },
  { id: "science", label: "科学" },
  { id: "morality", label: "道德与法治" },
  { id: "physics", label: "物理" },
  { id: "chemistry", label: "化学" },
  { id: "biology", label: "生物" },
  { id: "history", label: "历史" },
  { id: "geography", label: "地理" },
  { id: "politics", label: "思想政治" },
  { id: "it", label: "信息技术" },
  { id: "pe", label: "体育与健康" },
  { id: "music", label: "音乐" },
  { id: "art", label: "美术" },
] as const;

const GRADE_BASE_BAND: Record<string, GradeBand> = Object.fromEntries(
  GRADE_BASE_META.map((r) => [r.id, r.band]),
);

/** 不同学段可选的课程学科（与课标大致对齐） */
const SUBJECTS_BY_BAND: Record<GradeBand, readonly string[]> = {
  primary: ["chinese", "math", "english", "science", "morality", "pe", "music", "art"],
  junior: [
    "chinese",
    "math",
    "english",
    "physics",
    "chemistry",
    "biology",
    "history",
    "geography",
    "politics",
    "it",
    "pe",
    "music",
    "art",
    "morality",
  ],
  senior: [
    "chinese",
    "math",
    "english",
    "physics",
    "chemistry",
    "biology",
    "history",
    "geography",
    "politics",
    "it",
    "pe",
    "music",
    "art",
    "morality",
  ],
};

/** 去掉 `_s1` / `_s2` 学期后缀，得到学年基准 id（如 `hs_g2_s1` → `hs_g2`） */
export function gradeBaseId(gradeId: string): string {
  return gradeId.replace(/_s[12]$/, "");
}

export function gradeBand(gradeId: string): GradeBand | undefined {
  const base = gradeBaseId(gradeId);
  return GRADE_BASE_BAND[base];
}

/** 当前年级下允许选择的学科 id 列表 */
export function subjectsAllowedForGrade(gradeId: string): string[] {
  if (!gradeId?.trim()) return [];
  if (gradeId === GEN_GRADE_UNBOUND_ID) {
    return CURRICULUM_SUBJECT_OPTIONS.map((s) => s.id);
  }
  const band = gradeBand(gradeId);
  if (!band) return [...SUBJECTS_BY_BAND.senior];
  return [...SUBJECTS_BY_BAND[band]];
}

export function curriculumOptionsForGrade(gradeId: string) {
  if (!gradeId?.trim()) return [];
  const allowed = new Set(subjectsAllowedForGrade(gradeId));
  return CURRICULUM_SUBJECT_OPTIONS.filter((s) => allowed.has(s.id));
}

/** 所有学科共用的范围 id；与课标领域多选叠加，表示贴近教材单元与例题风格 */
export const TEXTBOOK_SYNC_SCOPE = { id: "textbook_sync", label: "教材同步" } as const;

/**
 * 命题入库用的教材版本字符串：按学科枚举，避免「人教/RJ/人教版」混写导致 AI 与统计失真。
 * 未列学科回退 {@link TEXTBOOK_EDITION_FALLBACK_GENERIC}。
 */
export const TEXTBOOK_EDITION_OPTIONS_BY_SUBJECT: Record<string, readonly string[]> = {
  chinese: [
    "统编版（部编）",
    "人教版（语文·旧版）",
    "苏教版",
    "北师大版（语文）",
    "语文版",
    "中华书局版",
  ],
  math: [
    "人教版",
    "北师大版",
    "苏教版",
    "沪教版",
    "浙教版",
    "华师大版",
    "湘教版",
    "冀教版",
    "青岛版",
    "苏科版",
  ],
  english: [
    "人教版（PEP）",
    "外研版（新标准）",
    "译林版（牛津）",
    "沪教版（牛津）",
    "冀教版",
    "仁爱版",
    "北师大版（英语）",
    "重大版",
  ],
  physics: ["人教版", "教科版", "沪科版", "粤教版", "鲁科版", "北师大版（物理）", "苏科版"],
  chemistry: ["人教版", "鲁科版", "苏教版", "沪科版", "浙科版"],
  biology: ["人教版", "北师大版", "浙科版", "沪科版", "苏教版", "中图版"],
  politics: ["统编版（思想政治）"],
  morality: ["统编版（道德与法治）", "人教版（道法）", "鲁人版"],
  history: ["统编版（历史）", "人教版（历史·旧版）", "北师大版（历史）", "岳麓版"],
  geography: ["人教版", "湘教版", "中图版", "鲁教版", "商务星球版", "沪教版"],
  science: ["教科版", "浙教版", "人教版（科学）", "沪教版", "苏教版", "冀人版"],
  it: ["教科版", "浙教版", "粤教版", "人教版（信息技术）", "华东师大版"],
  pe: ["人教版", "华东师大版"],
  music: ["人音版", "湘艺版", "花城版", "人教版（音乐）"],
  art: ["人美版", "湘美版", "浙美版", "人教版（美术）", "岭南版"],
};

const TEXTBOOK_EDITION_FALLBACK_GENERIC = ["人教版", "北师大版", "苏教版", "沪教版"] as const;

/** 命题页「教材版本」下拉选项（随学科变化）；入库值与 option.value 一致 */
export function textbookEditionSelectOptions(
  subjectId: string,
): { value: string; label: string }[] {
  const raw = TEXTBOOK_EDITION_OPTIONS_BY_SUBJECT[subjectId];
  const list = raw?.length ? raw : TEXTBOOK_EDITION_FALLBACK_GENERIC;
  return list.map((label) => ({ value: label, label }));
}

/** 自定义教材版本时的补充输入占位（仅在选择「其他」或与枚举不完全一致时出现） */
export const TEXTBOOK_EDITION_CUSTOM_PLACEHOLDER =
  "若需写明册别或校本体系，如：人教A版 · 必修第二册、校本一轮复习";

/** 章节范围：辅助联想（datalist），可与自由输入并存，便于后续扩展为搜索树 */
export function chapterFocusSuggestionsForSubject(subjectId: string): string[] {
  const common = ["期中复习", "期末复习", "单元检测", "专题突破"];
  switch (subjectId) {
    case "math":
      return [
        ...common,
        "有理数与整式",
        "方程与不等式",
        "函数",
        "三角形与四边形",
        "圆",
        "统计与概率",
        "第三单元",
      ];
    case "chinese":
      return [...common, "语言文字运用", "现代文阅读", "古诗文阅读", "写作", "整本书阅读"];
    case "english":
      return [...common, "语法与词汇", "阅读理解", "写作", "听力（笔试卷面）"];
    case "physics":
      return [...common, "力学", "电磁学", "光学与热学", "实验探究"];
    case "chemistry":
      return [...common, "物质结构", "化学反应原理", "有机化学基础", "实验"];
    case "biology":
      return [...common, "细胞与分子", "遗传与进化", "生态", "实验"];
    case "history":
      return [...common, "中国古代史", "中国近现代史", "世界史", "史料综合"];
    case "geography":
      return [...common, "自然地理", "人文地理", "区域地理"];
    case "politics":
    case "morality":
      return [...common, "国情与法治", "经济与社会", "哲学与文化"];
    default:
      return common;
  }
}

export function chapterFocusPlaceholderForSubject(subjectId: string | undefined): string {
  switch (subjectId) {
    case "math":
      return "如：七下 第三章 相交线与平行线；或输入关键词联想下方建议…";
    case "chinese":
      return "如：第三单元 实用性阅读与交流；整本书《乡土中国》…";
    case "english":
      return "如：Unit 3 · Environmental Protection；语法：非谓语动词…";
    default:
      return "如：第三单元《圆柱与圆锥》、期中复习范围、§3.2～3.4…";
  }
}

/** @deprecated 旧版自由文本占位；已由 {@link TEXTBOOK_EDITION_CUSTOM_PLACEHOLDER} 与下拉枚举替代 */
export const TEXTBOOK_EDITION_HINT_PLACEHOLDER = TEXTBOOK_EDITION_CUSTOM_PLACEHOLDER;

export const CHAPTER_FOCUS_PLACEHOLDER = "如：第三单元《圆柱与圆锥》、期中复习范围、§3.2～3.4…";

/**
 * 各学科可选的命题范围（细分）；同一学科在不同学段由命题提示自行把握难度。
 * id 全局唯一，便于多选学科时合并展示。
 */
export const SCOPE_BY_SUBJECT: Record<string, readonly { id: string; label: string }[]> = {
  chinese: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "cn_base", label: "语言文字运用" },
    { id: "cn_read", label: "阅读理解" },
    { id: "cn_classical", label: "文言文 / 古代诗文" },
    { id: "cn_write", label: "写作与表达" },
    { id: "cn_misc", label: "综合性学习" },
  ],
  math: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "math_num", label: "数与代数" },
    { id: "math_geom", label: "图形与几何" },
    { id: "math_stat", label: "统计与概率" },
    { id: "math_applied", label: "综合与实践" },
    { id: "math_trig", label: "三角函数 / 三角恒等变换" },
    { id: "math_analytic", label: "解析几何" },
    { id: "math_nt", label: "数论初步" },
    { id: "math_combo", label: "组合计数初步" },
  ],
  english: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "en_vocab", label: "词汇与语法" },
    { id: "en_read", label: "阅读理解" },
    { id: "en_write", label: "写作" },
    { id: "en_lang", label: "听力 / 口语（笔试卷面）" },
  ],
  science: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "sci_life", label: "生命科学" },
    { id: "sci_matter", label: "物质科学" },
    { id: "sci_earth", label: "地球与宇宙" },
    { id: "sci_tech", label: "技术与工程" },
  ],
  morality: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "mo_self", label: "自我认识与自尊自强" },
    { id: "mo_social", label: "社会与国情" },
    { id: "mo_law", label: "法治意识" },
  ],
  physics: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "ph_mechanics", label: "力学" },
    { id: "ph_em", label: "电磁学" },
    { id: "ph_optics", label: "光学与热学" },
    { id: "ph_modern", label: "近代物理初步" },
    { id: "ph_exp", label: "实验与探究" },
  ],
  chemistry: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "chem_atom", label: "物质结构与性质" },
    { id: "chem_rxn", label: "化学反应原理" },
    { id: "chem_org", label: "有机化学基础" },
    { id: "chem_exp", label: "实验化学" },
  ],
  biology: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "bio_cell", label: "细胞与分子" },
    { id: "bio_genetics", label: "遗传与进化" },
    { id: "bio_eco", label: "生态与环境" },
    { id: "bio_human", label: "人体生理与健康" },
    { id: "bio_lab", label: "实验与探究" },
  ],
  history: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "hist_cn", label: "中国历史" },
    { id: "hist_world", label: "世界历史" },
    { id: "hist_method", label: "史料与史观" },
  ],
  geography: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "geo_natural", label: "自然地理" },
    { id: "geo_human", label: "人文地理" },
    { id: "geo_regional", label: "区域地理" },
    { id: "geo_gis", label: "地理信息技术初步" },
  ],
  politics: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "pol_econ", label: "经济与社会" },
    { id: "pol_political", label: "政治与法治" },
    { id: "pol_philo", label: "哲学与文化" },
    { id: "pol_intl", label: "当代国际政治与经济" },
  ],
  it: [
    TEXTBOOK_SYNC_SCOPE,
    { id: "it_theory", label: "信息与计算基础" },
    { id: "it_algo", label: "算法与程序设计初步" },
    { id: "it_data", label: "数据与信息系统" },
  ],
  pe: [TEXTBOOK_SYNC_SCOPE, { id: "pe_general", label: "体能与运动技能综合" }],
  music: [TEXTBOOK_SYNC_SCOPE, { id: "mu_general", label: "鉴赏与表现综合" }],
  art: [TEXTBOOK_SYNC_SCOPE, { id: "art_general", label: "欣赏与创作综合" }],
};

const DEFAULT_SCOPE = [TEXTBOOK_SYNC_SCOPE, { id: "general", label: "综合" }] as const;

/**
 * 小学年级序号 1–6（仅 `pri_g*`）；非小学返回 undefined。
 */
export function primaryGradeNumber(gradeId: string): number | undefined {
  const base = gradeBaseId(gradeId);
  const m = /^pri_g(\d)$/.exec(base);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  if (n < 1 || n > 6) return undefined;
  return n;
}

/**
 * 按**年级 + 学科**返回「入门 / 进阶」等非竞赛难度下可选的命题范围（与竞赛卷无关）。
 *
 * 规则摘要（与常见课标进度对齐，可按产品再微调）：
 * - **语文**：小学一、二年级不出现「文言文 / 古代诗文」；三年级起与其它学段一致。
 * - **数学**：小学仅课标四大领域；初中不含解析几何 / 数论初步 / 组合计数（偏竞赛与高段）；高中全开。
 * - **物理**：初中不含「近代物理初步」。
 * - **化学**：初中不含「有机化学基础」（系统章节偏高中必修）。
 * - **地理**：初中不含「地理信息技术初步」（多为高中侧重）。
 * - **思想政治**：初中不含「当代国际政治与经济」（多为选择性必修语境）。
 * - 其余学科：与学科默认列表一致。
 */
export function scopesForGradeAndSubject(
  gradeId: string,
  subjectId: string,
): { id: string; label: string }[] {
  if (!gradeId?.trim() || !subjectId?.trim()) return [];

  const raw = SCOPE_BY_SUBJECT[subjectId] ?? DEFAULT_SCOPE;
  const base = [...raw];
  const band = gradeBand(gradeId);
  if (!band) return base;

  switch (subjectId) {
    case "chinese": {
      const pg = primaryGradeNumber(gradeId);
      if (pg !== undefined && pg <= 2) {
        return base.filter((o) => o.id !== "cn_classical");
      }
      return base;
    }
    case "math": {
      if (band === "primary") {
        const allow = new Set([
          "math_num",
          "math_geom",
          "math_stat",
          "math_applied",
          TEXTBOOK_SYNC_SCOPE.id,
        ]);
        return base.filter((o) => allow.has(o.id));
      }
      if (band === "junior") {
        const deny = new Set(["math_analytic", "math_nt", "math_combo"]);
        return base.filter((o) => !deny.has(o.id));
      }
      return base;
    }
    case "physics": {
      if (band === "junior") return base.filter((o) => o.id !== "ph_modern");
      return base;
    }
    case "chemistry": {
      if (band === "junior") return base.filter((o) => o.id !== "chem_org");
      return base;
    }
    case "geography": {
      if (band === "junior") return base.filter((o) => o.id !== "geo_gis");
      return base;
    }
    case "politics": {
      if (band === "junior") return base.filter((o) => o.id !== "pol_intl");
      return base;
    }
    default:
      return base;
  }
}

/** 合并当前所选学科对应的全部可选范围（按 id 去重）；不区分年级，仅用于兼容旧逻辑。 */
export function scopesForSubjects(subjectIds: string[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const sid of subjectIds) {
    const list = SCOPE_BY_SUBJECT[sid] ?? DEFAULT_SCOPE;
    for (const o of list) {
      map.set(o.id, o.label);
    }
  }
  return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
}

export function scopeLabelById(scopeId: string): string {
  if (scopeId === TEXTBOOK_SYNC_SCOPE.id) return TEXTBOOK_SYNC_SCOPE.label;
  for (const list of Object.values(SCOPE_BY_SUBJECT)) {
    const hit = list.find((o) => o.id === scopeId);
    if (hit) return hit.label;
  }
  if (scopeId === "general") return "综合";
  return scopeId;
}

export function curriculumSubjectLabel(id: string): string {
  return CURRICULUM_SUBJECT_OPTIONS.find((s) => s.id === id)?.label ?? id;
}

/** 生成页「特别要求」输入框占位示例，随所选学科 id 变化 */
export function notesPlaceholderForSubject(subjectId: string): string {
  const examples: Record<string, string> = {
    chinese: "例如：文言文一篇篇幅适中；写作体裁与字数；现代文阅读侧重论述类……",
    math: "例如：侧重函数与导数综合；编程题用 Python；包含一道概率统计或建模……",
    english: "例如：阅读体裁说明文或议论文；写作不少于 120 词；词汇侧重学术……",
    science: "例如：侧重物质变化与实验表述；探究情境题贴近生活……",
    morality: "例如：情境辨析贴近校园；侧重法治意识或国情材料……",
    physics: "例如：侧重力学与能量综合；受力分析与图像表述清晰……",
    chemistry: "例如：侧重无机推断或反应原理；方程式书写与定量计算……",
    biology: "例如：侧重遗传规律或生态案例；图表信息提取……",
    history: "例如：史料辨析一道；论述题时空范围与史观明确……",
    geography: "例如：侧重区域可持续发展；图文材料综合推断……",
    politics: "例如：侧重经济与社会材料；哲学论证条理清晰……",
    it: "例如：编程题指定 Python 或 C++；算法侧重 DP、图论或字符串……",
    pe: "例如：侧重体能评价标准；运动损伤预防情境……",
    music: "例如：鉴赏曲目风格辨析；乐理概念表述……",
    art: "例如：作品形式与流派分析；中西绘画任选一侧重……",
  };
  return examples[subjectId] ?? "例如：写明侧重知识模块、题型偏好或命题禁忌……";
}

export function gradeLevelLabel(id: string): string {
  if (id === GEN_GRADE_UNBOUND_ID) return "不绑定校内年级（按考试目标推断）";
  const hit = GRADE_LEVEL_OPTIONS.find((g) => g.id === id);
  if (hit) return hit.label;
  return GRADE_YEAR_LABELS[id] ?? id;
}

/** 学年称谓（不含学期），用于匹配旧数据「年级:高二」等 */
export function gradeYearLabel(gradeId: string): string {
  const base = gradeBaseId(gradeId);
  return GRADE_YEAR_LABELS[base] ?? gradeLevelLabel(gradeId);
}

/** 试卷库年级筛选：匹配「年级:高二（上）」等新标签，并兼容旧标签「年级:高二」 */
export function examMatchesGradeFilter(
  subjects: string[] | undefined | null,
  gradeId: string,
): boolean {
  const subs = subjects ?? [];
  const semesterLb = gradeLevelLabel(gradeId);
  const semesterTagged = `年级:${semesterLb}`;
  if (subs.includes(semesterTagged)) return true;

  const yearLb = gradeYearLabel(gradeId);
  const yearTagged = `年级:${yearLb}`;
  if (subs.includes(yearTagged)) return true;

  if (subs.some((s) => s.startsWith("年级:") && (s === semesterTagged || s.endsWith(semesterLb))))
    return true;
  if (subs.some((s) => s.startsWith("年级:") && (s === yearTagged || s.endsWith(yearLb))))
    return true;
  return subs.some((s) => s === semesterLb || s === yearLb);
}

/** 试卷库学科筛选：课程学科中文名（与生成入库一致） */
export function examMatchesCurriculumSubjectFilter(
  subjects: string[] | undefined | null,
  subjectId: string,
): boolean {
  const label = curriculumSubjectLabel(subjectId);
  return (subjects ?? []).includes(label);
}

/** 竞赛 / 高阶：不按课内细分范围约束 */
export function isCompetitionUnrestricted(difficulty: Difficulty): boolean {
  return difficulty === "competition" || difficulty === "advanced";
}

/**
 * 竞赛 / 高阶时的「竞赛侧重」：均限定在**用户已选的那一门学科**卷内；多选表示可在这些模块/能力轴之间**交叉、综合**命题（非再选其它课程学科）。
 * 说明：数理化生信息学是传统奥赛主阵地；语文、英语、人文社科同样有素养赛、作文赛、辩论赛、综合能力赛等形态，故各学科均给出合理档位。
 */
export const COMPETITION_FOCUS_BY_SUBJECT: Record<
  string,
  readonly { id: string; label: string }[]
> = {
  math: [
    { id: "math_try1", label: "联赛一试 · 高考带宽难题向" },
    { id: "math_try2_nt", label: "联赛二试 · 数论" },
    { id: "math_try2_combo", label: "联赛二试 · 组合" },
    { id: "math_try2_geom", label: "联赛二试 · 平几 / 立体几何" },
    { id: "math_try2_alg", label: "联赛二试 · 代数与不等式" },
    { id: "math_provincial", label: "省队选拔 / 夏令营综合" },
    { id: "math_cmo", label: "CMO / 国家集训队风格" },
  ],
  physics: [
    { id: "phy_prelim", label: "预赛 · 广度与快速建模" },
    { id: "phy_theory_remark", label: "复赛 · 理论建模与推导" },
    { id: "phy_exp_think", label: "复赛 · 实验思路与误差分析" },
    { id: "phy_final", label: "决赛理论 · 综合难点向" },
  ],
  chemistry: [
    { id: "chem_prelim", label: "初赛 · 无机 / 结构 / 基础有机综合" },
    { id: "chem_mech", label: "机理与结构进阶" },
    { id: "chem_quant", label: "定量计算与图像推断" },
    { id: "chem_final", label: "决赛 · 综合设计与高区分度" },
  ],
  biology: [
    { id: "bio_league", label: "联赛 · 生化遗传生态综合" },
    { id: "bio_labthink", label: "实验设计思路与表述向" },
    { id: "bio_final", label: "全国决赛区分度向" },
  ],
  it: [
    { id: "it_cspj", label: "入门组 · 模拟 / 枚举 / 入门算法" },
    { id: "it_csps", label: "提高组 · 图论 / DP / 数据结构" },
    { id: "it_noi", label: "NOI / 省选向综合" },
  ],
  chinese: [
    { id: "cn_read_lit", label: "文学类文本 · 高区分度阅读" },
    { id: "cn_classical_comp", label: "文言文阅读竞技向" },
    { id: "cn_essay_arg", label: "议论文 / 思辨写作竞技向" },
    { id: "cn_lang_use", label: "语言文字运用 · 压缩 / 表达 / 逻辑" },
  ],
  english: [
    { id: "en_read_deep", label: "读写综合 · 长文本推断" },
    { id: "en_write_acad", label: "议论 / 说明写作竞技向" },
    { id: "en_grammar_vocab", label: "语法词汇 · 高阶运用" },
    { id: "en_listening_style", label: "听力型笔试卷面（场景推断）" },
  ],
  science: [
    { id: "sci_inquiry", label: "探究与实验思维" },
    { id: "sci_cross", label: "跨模块综合应用" },
    { id: "sci_reason", label: "推理与建模表述" },
  ],
  morality: [
    { id: "mo_case", label: "情境辨析与价值论证" },
    { id: "mo_law", label: "法治与国情材料深度题" },
    { id: "mo_practice", label: "实践探究类表述" },
  ],
  history: [
    { id: "hist_material", label: "史料辨析与史观" },
    { id: "hist_essay", label: "综合论述与比较" },
    { id: "hist_map", label: "时空与地图信息综合" },
  ],
  geography: [
    { id: "geo_material", label: "图文材料综合推断" },
    { id: "geo_regional", label: "区域与可持续发展综合" },
    { id: "geo_skill", label: "技能与图表阅读竞技向" },
  ],
  politics: [
    { id: "pol_philo", label: "哲学 · 逻辑与论证" },
    { id: "pol_econ", label: "经济与社会 · 模型化解读" },
    { id: "pol_law", label: "政治与法治 · 案例深度" },
    { id: "pol_culture", label: "文化与国际视野（思辨综合）" },
  ],
  pe: [{ id: "pe_theory", label: "运动科学与健康理论综合" }],
  music: [{ id: "mu_theory", label: "鉴赏 · 乐理与作品分析" }],
  art: [{ id: "art_crit", label: "鉴赏 · 形式分析与评述" }],
};

const DEFAULT_COMPETITION_FOCUS: readonly { id: string; label: string }[] = [
  { id: "general_comp", label: "学科综合拓展与竞技向" },
];

/** 竞赛 / 高阶难度下，可选的侧重列表（随学科变化） */
export function competitionFocusOptions(subjectId: string): { id: string; label: string }[] {
  const list = COMPETITION_FOCUS_BY_SUBJECT[subjectId] ?? DEFAULT_COMPETITION_FOCUS;
  return [...list];
}

export function competitionFocusLabelById(subjectId: string, focusId: string): string {
  const hit = competitionFocusOptions(subjectId).find((o) => o.id === focusId);
  return hit?.label ?? focusId;
}

export function isValidCompetitionFocus(subjectId: string, focusId: string): boolean {
  return competitionFocusOptions(subjectId).some((o) => o.id === focusId);
}

/**
 * 全部题型枚举顺序（生成页遍历、提交载荷、零初始矩阵一致）。
 * 含交叉学科类：数学中的物理/化学情境；物理/化学中的数理工具与定量等。
 */
export const ALL_QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "multiple_choice_multi",
  "fill_blank",
  "calculation",
  "short_answer",
  "proof",
  "programming",
  "essay",
  "cross_math_physics",
  "cross_math_chemistry",
  "cross_physics_math",
  "cross_chemistry_math",
];

const MATH_CROSS_TYPES: QuestionType[] = ["cross_math_physics", "cross_math_chemistry"];

function baseQuestionTypesForSubject(subjectId: string): QuestionType[] {
  switch (subjectId) {
    case "math":
      return [
        "multiple_choice",
        "multiple_choice_multi",
        "fill_blank",
        "calculation",
        "short_answer",
        "proof",
        "programming",
        ...MATH_CROSS_TYPES,
      ];
    case "physics":
      return [
        "multiple_choice",
        "multiple_choice_multi",
        "fill_blank",
        "calculation",
        "short_answer",
        "proof",
        "cross_physics_math",
      ];
    case "chemistry":
      return [
        "multiple_choice",
        "multiple_choice_multi",
        "fill_blank",
        "calculation",
        "short_answer",
        "proof",
        "cross_chemistry_math",
      ];
    case "biology":
      return ["multiple_choice", "multiple_choice_multi", "fill_blank", "short_answer", "proof"];
    case "chinese":
    case "english":
      return ["multiple_choice", "multiple_choice_multi", "fill_blank", "short_answer", "essay"];
    case "history":
    case "geography":
    case "politics":
    case "morality":
      return ["multiple_choice", "multiple_choice_multi", "fill_blank", "short_answer"];
    case "it":
      return [
        "multiple_choice",
        "multiple_choice_multi",
        "fill_blank",
        "short_answer",
        "programming",
        "calculation",
      ];
    case "science":
      return [
        "multiple_choice",
        "multiple_choice_multi",
        "fill_blank",
        "short_answer",
        "calculation",
      ];
    case "pe":
    case "music":
    case "art":
      return ["multiple_choice", "multiple_choice_multi", "fill_blank", "short_answer"];
    default:
      return [...ALL_QUESTION_TYPES];
  }
}

/**
 * 按学科与学段筛选可用题型（与各学科常见卷面形态对齐）。
 * 数学可含数物/数化综合题；物理、化学卷分别增加数理工具题、化学定量题；语文/英语含作文题。
 */
export function questionTypesForSubject(subjectId: string, gradeId?: string): QuestionType[] {
  const base = baseQuestionTypesForSubject(subjectId);
  const band = gradeId ? gradeBand(gradeId) : undefined;
  if (band === "primary" && subjectId === "math") {
    return base.filter((t) => t !== "programming");
  }
  return base;
}

const ZERO_COMPOSITION: Record<QuestionType, number> = ALL_QUESTION_TYPES.reduce(
  (acc, t) => {
    acc[t] = 0;
    return acc;
  },
  {} as Record<QuestionType, number>,
);

/** 各题型题量为 0（生成页不设预设题量时使用） */
export function emptyQuestionComposition(): Record<QuestionType, number> {
  return { ...ZERO_COMPOSITION };
}

/** 各学科默认题量分配（约 11 题）；仅包含该学科允许的题型 */
export function defaultCompositionForSubject(
  subjectId: string,
  gradeId?: string,
): Record<QuestionType, number> {
  const allowed = new Set(questionTypesForSubject(subjectId, gradeId));

  const pick = (p: Partial<Record<QuestionType, number>>): Record<QuestionType, number> => {
    const r: Record<QuestionType, number> = { ...ZERO_COMPOSITION };
    for (const t of ALL_QUESTION_TYPES) {
      const v = p[t];
      if (v !== undefined && allowed.has(t)) r[t] = v;
    }
    return r;
  };

  const band = gradeId ? gradeBand(gradeId) : undefined;

  if (subjectId === "math") {
    if (band === "primary" || !allowed.has("programming")) {
      return pick({
        multiple_choice: 3,
        fill_blank: 2,
        calculation: 2,
        short_answer: 2,
        cross_math_physics: 1,
        cross_math_chemistry: 1,
      });
    }
    return pick({
      multiple_choice: 3,
      fill_blank: 2,
      calculation: 1,
      short_answer: 2,
      proof: 1,
      programming: 1,
      cross_math_physics: 1,
      cross_math_chemistry: 0,
    });
  }
  if (subjectId === "physics") {
    return pick({
      multiple_choice: 3,
      fill_blank: 2,
      calculation: 2,
      short_answer: 2,
      proof: 1,
      cross_physics_math: 1,
    });
  }
  if (subjectId === "chemistry") {
    return pick({
      multiple_choice: 3,
      fill_blank: 2,
      calculation: 2,
      short_answer: 2,
      proof: 1,
      cross_chemistry_math: 1,
    });
  }
  if (subjectId === "biology") {
    return pick({ multiple_choice: 4, fill_blank: 2, short_answer: 3, proof: 2 });
  }
  if (subjectId === "it") {
    return pick({
      multiple_choice: 2,
      fill_blank: 2,
      calculation: 1,
      short_answer: 2,
      programming: 4,
    });
  }
  if (subjectId === "science") {
    return pick({ multiple_choice: 4, fill_blank: 2, short_answer: 3, calculation: 2 });
  }
  if (subjectId === "chinese" || subjectId === "english") {
    return pick({ multiple_choice: 3, fill_blank: 2, short_answer: 3, essay: 3 });
  }
  if (
    subjectId === "history" ||
    subjectId === "geography" ||
    subjectId === "politics" ||
    subjectId === "morality"
  ) {
    return pick({ multiple_choice: 4, fill_blank: 3, short_answer: 4 });
  }
  if (subjectId === "pe" || subjectId === "music" || subjectId === "art") {
    return pick({ multiple_choice: 4, fill_blank: 3, short_answer: 4 });
  }

  return pick({
    multiple_choice: 3,
    fill_blank: 2,
    calculation: 1,
    short_answer: 2,
    proof: 1,
    programming: 1,
    cross_math_physics: 1,
    cross_math_chemistry: 0,
  });
}

/**
 * 试卷场景（与「难度」正交：难度仍用 beginner / intermediate / competition / advanced）；
 * 用于命题提示与入库标签 `试卷场景:…`。
 */
export const PAPER_KIND_OPTIONS = [
  { id: "regular_daily", label: "日常考试 / 随堂测" },
  { id: "regular_unit", label: "单元测试" },
  { id: "regular_final", label: "期中 / 期末" },
  { id: "entrance_mock", label: "升学 · 模拟卷" },
  { id: "entrance_drill", label: "升学 · 压轴 / 专项训练" },
  { id: "entrance_sprint", label: "升学 · 冲刺卷" },
  { id: "entrance_past_style", label: "升学 · 真题风格 / 仿真" },
  { id: "contest_school", label: "校内学科竞赛" },
  { id: "contest_city", label: "市级学科竞赛" },
  { id: "contest_provincial", label: "省级学科竞赛" },
  { id: "olympiad", label: "奥林匹克竞赛（奥数 / 理科学科奥赛等综合）" },
] as const;

export type PaperKindId = (typeof PAPER_KIND_OPTIONS)[number]["id"];

export function paperKindLabel(id: string | undefined): string {
  if (!id?.trim()) return "—";
  const hit = PAPER_KIND_OPTIONS.find((o) => o.id === id);
  return hit?.label ?? id;
}

/**
 * 升学阶段 / 考试轨道（与「年级」正交）。
 * 选拔/衔接类命题不应默认绑死在单册教材章节；服务端与命题提示会据此切换约束。
 */
export const EXAM_TRACK_OPTIONS = [
  { id: "school_sync", label: "校内同步" },
  { id: "pri_to_jhs", label: "小升初" },
  { id: "jhs_to_hs", label: "初升高" },
  { id: "hs_to_univ", label: "高升大" },
  { id: "contest_track", label: "学科竞赛 / 选拔" },
  { id: "intl_curriculum", label: "国际课程" },
  { id: "adult_exam", label: "成人考试" },
] as const;

export type ExamTrackId = (typeof EXAM_TRACK_OPTIONS)[number]["id"];

/** 升学选拔模式下列出的轨道（不含校内同步与竞赛专用轨） */
export const EXAM_TRACK_IDS_ENTRANCE: ExamTrackId[] = [
  "pri_to_jhs",
  "jhs_to_hs",
  "hs_to_univ",
  "intl_curriculum",
  "adult_exam",
];

/** 命题页一级「考试模式」，驱动字段显隐与试卷场景集合 */
export type ExamGenerationModeId =
  | "school_sync"
  | "entrance_select"
  | "subject_contest"
  | "ai_drill";

export const EXAM_GENERATION_MODE_OPTIONS: readonly {
  id: ExamGenerationModeId;
  label: string;
  description: string;
}[] = [
  {
    id: "school_sync",
    label: "校内同步",
    description: "年级、学科、课标命题范围与单元考 / 期末等校内场景",
  },
  {
    id: "entrance_select",
    label: "升学选拔",
    description: "小升初 / 中考 / 高考等目标体系，不按单册教材章节约束",
  },
  {
    id: "subject_contest",
    label: "学科竞赛",
    description: "竞赛级别与模块侧重，弱化校内年级绑定",
  },
  {
    id: "ai_drill",
    label: "AI 专项训练",
    description: "按能力点与题型快速组卷，侧重题量与难度",
  },
];

/** 当前模式下可选的试卷场景 id（与 {@link PAPER_KIND_OPTIONS} 对应） */
export function paperKindIdsForExamMode(mode: ExamGenerationModeId): PaperKindId[] {
  switch (mode) {
    case "school_sync":
      return ["regular_daily", "regular_unit", "regular_final"];
    case "entrance_select":
      return ["entrance_mock", "entrance_drill", "entrance_sprint", "entrance_past_style"];
    case "subject_contest":
      return ["contest_school", "contest_city", "contest_provincial", "olympiad"];
    case "ai_drill":
      return ["regular_daily", "regular_unit"];
    default:
      return ["regular_daily"];
  }
}

/** 根据入库的 exam_track 推断考试模式（用于队列回填） */
export function inferExamGenerationModeFromTrack(
  track: ExamTrackId | undefined,
): ExamGenerationModeId {
  const t = track ?? "school_sync";
  if (t === "school_sync") return "school_sync";
  if (t === "contest_track") return "subject_contest";
  if (EXAM_TRACK_IDS_ENTRANCE.includes(t as ExamTrackId)) return "entrance_select";
  return "entrance_select";
}

const CURRICULUM_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  CURRICULUM_SUBJECT_OPTIONS.map((s) => [s.id, s.label]),
);

/** 学科竞赛模式下列出的五项（入库仍用 math / physics 等 id，仅展示名区分） */
const CONTEST_SUBJECT_IDS_ORDER = ["math", "physics", "chemistry", "it", "biology"] as const;
const CONTEST_SUBJECT_LABEL_BY_ID: Record<string, string> = {
  math: "数学竞赛",
  physics: "物理竞赛",
  chemistry: "化学竞赛",
  it: "信息学竞赛",
  biology: "生物竞赛",
};

function curriculumLabelDefault(subjectId: string): string {
  return CURRICULUM_LABEL_BY_ID[subjectId] ?? subjectId;
}

/**
 * 命题页学科下拉展示名：竞赛模式下同一 subject id 显示为「××竞赛」。
 */
export function subjectLabelForGeneratePicker(
  examMode: ExamGenerationModeId,
  subjectId: string,
): string {
  if (examMode === "subject_contest" && CONTEST_SUBJECT_LABEL_BY_ID[subjectId]) {
    return CONTEST_SUBJECT_LABEL_BY_ID[subjectId];
  }
  return curriculumLabelDefault(subjectId);
}

export type CurriculumSubjectPickerGroups = {
  /** 默认展示：适合 AI 结构化组卷的核心学科 */
  core: readonly { id: string; label: string }[];
  /** 「更多学科」：音体美、信息技术等弱结构化或实验性场景 */
  extended: readonly { id: string; label: string }[];
};

function entranceTrackSubjectIds(track: ExamTrackId): { core: string[]; extended: string[] } {
  switch (track) {
    case "pri_to_jhs":
      return {
        core: ["chinese", "math", "english", "science"],
        extended: ["morality", "it", "pe", "music", "art"],
      };
    case "jhs_to_hs":
      return {
        core: ["chinese", "math", "english", "physics", "chemistry", "morality", "history"],
        extended: ["biology", "geography", "politics", "it", "pe", "music", "art"],
      };
    case "hs_to_univ":
      return {
        core: [
          "chinese",
          "math",
          "english",
          "physics",
          "chemistry",
          "biology",
          "politics",
          "history",
          "geography",
          "morality",
        ],
        extended: ["it", "pe", "music", "art"],
      };
    case "intl_curriculum":
    case "adult_exam":
      return {
        core: [
          "chinese",
          "math",
          "english",
          "physics",
          "chemistry",
          "biology",
          "politics",
          "history",
          "geography",
          "morality",
        ],
        extended: ["science", "it", "pe", "music", "art"],
      };
    default:
      return aiDrillSubjectIds();
  }
}

function aiDrillSubjectIds(): { core: string[]; extended: string[] } {
  return {
    core: [
      "chinese",
      "math",
      "english",
      "physics",
      "chemistry",
      "biology",
      "politics",
      "history",
      "geography",
      "morality",
    ],
    extended: ["science", "it", "pe", "music", "art"],
  };
}

function mapIdsToOptions(
  ids: readonly string[],
  labelOf: (id: string) => string,
): { id: string; label: string }[] {
  return ids.map((id) => ({ id, label: labelOf(id) }));
}

/**
 * 命题页学科列表拆成「核心 / 更多」：按考试模式与升学阶段过滤，避免初升高仍出现音体美等割裂选项。
 */
export function curriculumSubjectPickerGroups(args: {
  examMode: ExamGenerationModeId;
  examTrack: ExamTrackId;
  gradeId: string;
}): CurriculumSubjectPickerGroups {
  const { examMode, examTrack, gradeId } = args;

  if (examMode === "subject_contest") {
    const core = mapIdsToOptions(
      [...CONTEST_SUBJECT_IDS_ORDER],
      (id) => CONTEST_SUBJECT_LABEL_BY_ID[id] ?? id,
    );
    return { core, extended: [] };
  }

  if (examMode === "ai_drill") {
    const { core, extended } = aiDrillSubjectIds();
    return {
      core: mapIdsToOptions(core, curriculumLabelDefault),
      extended: mapIdsToOptions(extended, curriculumLabelDefault),
    };
  }

  if (examMode === "entrance_select") {
    const { core, extended } = entranceTrackSubjectIds(examTrack);
    return {
      core: mapIdsToOptions(core, curriculumLabelDefault),
      extended: mapIdsToOptions(extended, curriculumLabelDefault),
    };
  }

  /** school_sync */
  const allowed = subjectsAllowedForGrade(gradeId);
  if (allowed.length === 0) {
    return { core: [], extended: [] };
  }
  const allowedSet = new Set(allowed);
  const band = gradeBand(gradeId);

  let coreRaw: string[];
  let extendedRaw: string[];

  if (band === "primary") {
    coreRaw = ["chinese", "math", "english", "science"];
    extendedRaw = ["morality", "pe", "music", "art"];
  } else if (band === "junior") {
    coreRaw = [
      "chinese",
      "math",
      "english",
      "physics",
      "chemistry",
      "biology",
      "morality",
      "history",
      "geography",
      "politics",
    ];
    extendedRaw = ["it", "pe", "music", "art"];
  } else {
    coreRaw = [
      "chinese",
      "math",
      "english",
      "physics",
      "chemistry",
      "biology",
      "politics",
      "history",
      "geography",
      "morality",
    ];
    extendedRaw = ["it", "pe", "music", "art"];
  }

  const core = mapIdsToOptions(
    coreRaw.filter((id) => allowedSet.has(id)),
    curriculumLabelDefault,
  );
  const extended = mapIdsToOptions(
    extendedRaw.filter((id) => allowedSet.has(id)),
    curriculumLabelDefault,
  );

  return { core, extended };
}

/**
 * 命题页「难度」下拉选项：仅「学科竞赛」模式保留竞赛/高阶（联赛、CMO 等侧重单独展示）；
 * 其它模式只用基础/提升两档，避免与升学目标体系（如中考压轴）语义冲突。
 */
export function difficultySelectOptionsForExamMode(
  mode: ExamGenerationModeId,
): { id: Difficulty; label: string }[] {
  if (mode === "subject_contest") {
    return (["beginner", "intermediate", "competition", "advanced"] as const).map((id) => ({
      id,
      label: DIFFICULTY_LABELS[id],
    }));
  }
  return [
    { id: "beginner", label: "基础" },
    { id: "intermediate", label: "提升" },
  ];
}

/** 命题概览 / 页眉等与模式下拉文案一致的难度展示 */
export function difficultyDisplayLabelForExamMode(
  mode: ExamGenerationModeId | undefined,
  id: Difficulty | null | undefined,
): string {
  if (!id) return "—";
  if (mode === "subject_contest") return DIFFICULTY_LABELS[id];
  if (id === "beginner") return "基础";
  if (id === "intermediate") return "提升";
  return DIFFICULTY_LABELS[id];
}

/** 供 Zod `z.enum` 使用（单一遍历来源） */
export const EXAM_TRACK_ZOD_ENUM = EXAM_TRACK_OPTIONS.map((o) => o.id) as unknown as [
  ExamTrackId,
  ...ExamTrackId[],
];

export const EXAM_TRACK_ID_SET = new Set<string>(EXAM_TRACK_OPTIONS.map((o) => o.id));

export function examTrackLabel(id: string | undefined): string {
  if (!id?.trim()) return "—";
  const hit = EXAM_TRACK_OPTIONS.find((o) => o.id === id);
  return hit?.label ?? id;
}

export function isSchoolSyncExamTrack(id: string | undefined): boolean {
  return (id ?? "school_sync") === "school_sync";
}

/** 目标体系：条目必须携带所属 `exam_track`，便于联动下拉 */
export const TARGET_TRACK_OPTIONS = [
  { id: "ps_private", exam_track: "pri_to_jhs", label: "重点民办" },
  { id: "ps_public", exam_track: "pri_to_jhs", label: "重点公办" },
  { id: "ps_tracking", exam_track: "pri_to_jhs", label: "分班考" },
  { id: "ps_olympiad", exam_track: "pri_to_jhs", label: "奥数体系" },
  { id: "ps_cup", exam_track: "pri_to_jhs", label: "杯赛体系" },
  { id: "jh_zhongkao_base", exam_track: "jhs_to_hs", label: "中考基础" },
  { id: "jh_zhongkao_hard", exam_track: "jhs_to_hs", label: "中考压轴" },
  { id: "jh_self_enroll", exam_track: "jhs_to_hs", label: "自主招生" },
  { id: "jh_key_hs", exam_track: "jhs_to_hs", label: "重点高中" },
  { id: "jh_key_class", exam_track: "jhs_to_hs", label: "实验班" },
  { id: "hs_gaokao_base", exam_track: "hs_to_univ", label: "高考基础" },
  { id: "hs_round1", exam_track: "hs_to_univ", label: "高考一轮" },
  { id: "hs_round2", exam_track: "hs_to_univ", label: "高考二轮" },
  { id: "hs_qiangji", exam_track: "hs_to_univ", label: "强基计划" },
  { id: "hs_zhpj", exam_track: "hs_to_univ", label: "综合评价" },
  { id: "ct_math_league", exam_track: "contest_track", label: "数学联赛向" },
  { id: "ct_physics", exam_track: "contest_track", label: "物理竞赛向" },
  { id: "ct_chemistry", exam_track: "contest_track", label: "化学竞赛向" },
  { id: "ct_info", exam_track: "contest_track", label: "信息学向" },
  { id: "ct_amc", exam_track: "contest_track", label: "AMC / 美式竞赛" },
  { id: "ct_kangaroo", exam_track: "contest_track", label: "袋鼠等趣味赛" },
  { id: "intl_ib", exam_track: "intl_curriculum", label: "IB" },
  { id: "intl_ap", exam_track: "intl_curriculum", label: "AP" },
  { id: "intl_alevel", exam_track: "intl_curriculum", label: "A-Level" },
  { id: "adult_upgrade", exam_track: "adult_exam", label: "专升本" },
  { id: "adult_postgrad", exam_track: "adult_exam", label: "考研基础" },
] as const satisfies readonly { id: string; exam_track: ExamTrackId; label: string }[];

export function targetTracksForExamTrack(track: ExamTrackId): { id: string; label: string }[] {
  return TARGET_TRACK_OPTIONS.filter((t) => t.exam_track === track).map((t) => ({
    id: t.id,
    label: t.label,
  }));
}

export function targetTrackLabel(id: string | undefined): string {
  if (!id?.trim()) return "—";
  const hit = TARGET_TRACK_OPTIONS.find((o) => o.id === id);
  return hit?.label ?? id;
}

export function isValidTargetForExamTrack(
  examTrack: ExamTrackId,
  targetId: string | undefined | null,
): boolean {
  if (!targetId?.trim()) return true;
  return TARGET_TRACK_OPTIONS.some((t) => t.id === targetId && t.exam_track === examTrack);
}
