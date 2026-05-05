import type { Difficulty, QuestionType } from "@/lib/types";

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

const DEFAULT_SCOPE = [
  TEXTBOOK_SYNC_SCOPE,
  { id: "general", label: "综合" },
] as const;

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
    chinese:
      "例如：文言文一篇篇幅适中；写作体裁与字数；现代文阅读侧重论述类……",
    math:
      "例如：侧重函数与导数综合；编程题用 Python；包含一道概率统计或建模……",
    english:
      "例如：阅读体裁说明文或议论文；写作不少于 120 词；词汇侧重学术……",
    science:
      "例如：侧重物质变化与实验表述；探究情境题贴近生活……",
    morality:
      "例如：情境辨析贴近校园；侧重法治意识或国情材料……",
    physics:
      "例如：侧重力学与能量综合；受力分析与图像表述清晰……",
    chemistry:
      "例如：侧重无机推断或反应原理；方程式书写与定量计算……",
    biology:
      "例如：侧重遗传规律或生态案例；图表信息提取……",
    history:
      "例如：史料辨析一道；论述题时空范围与史观明确……",
    geography:
      "例如：侧重区域可持续发展；图文材料综合推断……",
    politics:
      "例如：侧重经济与社会材料；哲学论证条理清晰……",
    it:
      "例如：编程题指定 Python 或 C++；算法侧重 DP、图论或字符串……",
    pe:
      "例如：侧重体能评价标准；运动损伤预防情境……",
    music:
      "例如：鉴赏曲目风格辨析；乐理概念表述……",
    art:
      "例如：作品形式与流派分析；中西绘画任选一侧重……",
  };
  return examples[subjectId] ?? "例如：写明侧重知识模块、题型偏好或命题禁忌……";
}

export function gradeLevelLabel(id: string): string {
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
      return ["multiple_choice", "multiple_choice_multi", "fill_blank", "short_answer", "calculation"];
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
