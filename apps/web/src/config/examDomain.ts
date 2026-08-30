import examDomainJson from "./exam-domain.json";
import type { Difficulty } from "@/lib/types";

export type PaperKindGroup = "regular" | "entrance" | "contest";

export type ChoiceOptionsLayoutConfig = {
  /** 单选项版面权重上限（横排）——与附图并排时用（横向空间更紧） */
  inlineMaxWeightPerOption: number;
  /** 全部选项权重总和上限（横排）——与附图并排时用 */
  inlineMaxTotalWeight: number;
  /** 单选项权重上限（双列）——与附图并排时用 */
  columnsMaxWeightPerOption: number;
  /** 全部选项权重总和上限（双列）——与附图并排时用 */
  columnsMaxTotalWeight: number;
  /**
   * 无附图并排时：横排单选项权重上限。
   * 须能容纳短 `$n$` / `$k\\sqrt{2}$` 等四选一单行；过严会误成双列留白。
   */
  noBesideInlineMaxWeightPerOption: number;
  /** 无附图并排时：横排总权重上限（约 4× 短公式行内权重） */
  noBesideInlineMaxTotalWeight: number;
  /** 无附图并排时：双列单选项权重上限 */
  noBesideColumnsMaxWeightPerOption: number;
  /** 无附图并排时：双列总权重上限 */
  noBesideColumnsMaxTotalWeight: number;
  /**
   * 无附图并排且仍为横排时：选项均分可用宽度（justify-between + flex-1）。
   * 短选项单行铺满，避免挤左侧；跨学科通用。
   */
  noBesideInlineDistribute: boolean;
  /** 无附图并排 · 横排间距（rem）；distribute 时作最小间距 */
  noBesideInlineGapRem: number;
  /**
   * 无附图并排 · 横排单项最小宽度（rem）。
   * 0=不设 min-width（短四选一稳定单行）；>0 时过窄视口才折行。
   */
  noBesideInlineItemMinWidthRem: number;
  /** 与附图并排时单选项权重上限 */
  besideFigureMaxWeightPerOption: number;
  /** 与附图并排时总权重上限 */
  besideFigureMaxTotalWeight: number;
  /** 并排所需最少选项数 */
  besideFigureMinOptionCount: number;
  /** 选项与附图并排时的间距（rem，由配置驱动） */
  besideGapRem: number;
  /** 长选项竖排时选项与附图间距（rem） */
  stackedGapRem: number;
  /** 行内 $...$ / \\(...\\) 的权重 */
  inlineMathWeight: number;
  /** 独立公式 $$ / \\[ \\] 的权重 */
  displayMathWeight: number;
  /** 拉丁字母权重（相对 CJK=1） */
  latinCharWeight: number;
  /** 含 $$ 独立公式则强制纵向 */
  forceStackedIfDisplayMath: boolean;
  /** 选项内含换行则强制纵向 */
  forceStackedIfNewline: boolean;
};

/**
 * 非选择题卷面书写区：按题型 id / type_label 形态匹配（表驱动，跨学科）。
 * 首条命中生效；有选项且 skipWhenHasChoiceOptions 时不留白。
 */
export type AnswerWritingSpaceRule = {
  /** 稳定题型 id 正则（如 ^proof$、^cross_） */
  typeIdPatterns?: readonly string[];
  /** 卷面 type_label 正则（如 证明、解答、实验） */
  typeLabelPatterns?: readonly string[];
  /** 书写区最小高度（rem） */
  minHeightRem: number;
};

export type AnswerWritingSpaceConfig = {
  enabled: boolean;
  /** 有 A/B/C/D 选项时跳过（选择题不作大块书写区） */
  skipWhenHasChoiceOptions: boolean;
  /** 书写区底部分隔虚线；正式卷面默认 false */
  showBottomBorder?: boolean;
  /**
   * 明确不留作答空档的题型（选择题、填空等）。
   * 命中后直接 0，不再走 rules / default。
   */
  excludeTypeIdPatterns?: readonly string[];
  excludeTypeLabelPatterns?: readonly string[];
  /**
   * 未命中 exclude、也未命中 rules 时的默认留白（rem）。
   * 覆盖自定义综合题等未枚举 type_label，避免「未特举题型」挤在一起无法作答。
   */
  defaultMinHeightRem?: number;
  /** 按顺序匹配，首条命中 */
  rules: readonly AnswerWritingSpaceRule[];
};

/** 卷面小问编号与题干↔附图间距（配置驱动，禁止按题号特判） */
export type PaperSurfaceLayoutConfig = {
  /** bare=裸数字；fullwidth_paren=按模板如（{n}） */
  subquestionLabelStyle: "bare" | "fullwidth_paren";
  /** 数字小问展示模板，须含 {n} */
  subquestionLabelTemplate: string;
  /** 题干/选项区与附图区域顶距（rem） */
  stemToFigureGapRem: number;
  /** 题干与小问/后续块间距（rem）；过大会造成「题被拆开」 */
  stemToSubquestionGapRem: number;
  /** EPL 题干底部分隔线；false 时导语与小问视觉连贯 */
  stemShowBottomBorder: boolean;
  /** 卷面 Markdown 段落上下边距（rem） */
  stemMarkdownParagraphMarginRem: number;
  /** 卷面块级公式上下边距（rem）；短公式应优先降为行内 */
  stemDisplayMathMarginRem: number;
  /** 卷面代码/样例块上下边距（rem） */
  stemCodeBlockMarginRem: number;
  /**
   * 卷面行内代码（Markdown `ident`）外观。
   * plain_mono：等宽无灰底（试卷默认，避免 `arr` 变灰胶囊）；
   * muted_chip：灰底圆角（偏编辑器/设置页风格）。
   */
  stemInlineCodeAppearance: "plain_mono" | "muted_chip";
  /**
   * 题干标签段（行仅为 **标签**[:：]）启用缩进正文，区分设问与格式/样例/提示。
   * 匹配模式见 stemLabeledSectionLabelLinePattern，禁止按学科文案硬编码。
   */
  stemLabeledSectionsEnabled: boolean;
  /** 标签段正文左缩进（rem） */
  stemLabeledSectionIndentRem: number;
  /** 标签与其正文间距（rem） */
  stemLabeledSectionLabelGapRem: number;
  /** 相邻标签段间距（rem） */
  stemLabeledSectionBlockGapRem: number;
  /**
   * 标签行正则（整行匹配）。默认：整行仅为 Markdown 粗体 + 可选冒号。
   */
  stemLabeledSectionLabelLinePattern: string;
  /**
   * 可选：无 ** 的短标签行（以 ：/: 结尾）。空字符串=关闭。
   * 仍禁止硬编码学科文案，仅约束形态。
   */
  stemLabeledSectionPlainLabelLinePattern: string;
  /** 标签段正文竖直内边距（rem） */
  stemLabeledSectionBodyPaddingYRem: number;
  /** 标签段正文水平内边距（rem，叠在 indent 内侧） */
  stemLabeledSectionBodyPaddingXRem: number;
  /** 标签段正文是否铺浅底，强化与导语层级 */
  stemLabeledSectionBodySurface: boolean;
  /** EPL 紧凑图块外边距（rem） */
  figureBlockCompactMarginRem: number;
  /** EPL 常规图块外边距（rem） */
  figureBlockMarginRem: number;
  /** EPL 文档块纵向间距（rem） */
  eplBlockStackGapRem: number;
  /** 小问簇外边距（rem） */
  subquestionClusterMarginRem: number;
  /** 题+图认知簇外边距（rem） */
  questionClusterMarginRem: number;
  /** 附件图纵向 gap（rem） */
  attachmentStackGapRem: number;
  /** 附件图容器外边距（rem） */
  attachmentStackMarginRem: number;
  /** 单条小问权重上限：未超则可与附图并排 */
  subquestionFigureBesideMaxWeightPerItem: number;
  /** 全部小问权重总和上限 */
  subquestionFigureBesideMaxTotalWeight: number;
  /** 并排所需最少小问数 */
  subquestionFigureBesideMinCount: number;
  /** 并排允许的最多小问数（过多仍竖排） */
  subquestionFigureBesideMaxCount: number;
  /** 小问与附图并排间距（rem） */
  subquestionFigureBesideGapRem: number;
  /** 并排时附图最大宽度（rem） */
  subquestionFigureBesideFigureMaxWidthRem: number;
  /** 小问含 $$ / \\[ 独立公式则强制竖排 */
  subquestionFigureForceStackedIfDisplayMath: boolean;
  /** 单条小问正文含换行则强制竖排（避免并排时折行挤占） */
  subquestionFigureForceStackedIfMultiline: boolean;
  /**
   * 数字小问统一左缩进（rem）。
   * 0=与导语左缘对齐；>0 时由渲染层统一施加，避免 cluster/depth 叠缩进。
   */
  subquestionIndentRem: number;
  /**
   * （n）升格为大问 section 的正文**前缀**（须顶格匹配，避免「若将其」误伤）。
   * 空数组=数字括号一律作小问。
   */
  numericParenElevateToSectionBodyPrefixes: readonly string[];
  /**
   * 无附图时短小问排版：auto=按权重选 inline/columns/stacked；stacked=始终竖排。
   */
  subquestionNoFigureLayout: "auto" | "stacked";
  subquestionNoFigureInlineMaxWeightPerItem: number;
  subquestionNoFigureInlineMaxTotalWeight: number;
  subquestionNoFigureColumnsMaxWeightPerItem: number;
  subquestionNoFigureColumnsMaxTotalWeight: number;
  subquestionNoFigureForceStackedIfDisplayMath: boolean;
  /** 单条小问正文含换行则不做 inline/columns 紧凑 */
  subquestionNoFigureForceStackedIfMultiline: boolean;
  /** max/min 排版权重比超过此值时改 stacked（避免双列折行） */
  subquestionNoFigureStackIfWeightSpreadRatio: number;
  subquestionNoFigureMinCount: number;
  subquestionNoFigureMaxCount: number;
  /**
   * 听力题书面卷（题干不印发）· 命题端政策说明条。
   * false=隐藏（默认，避免冗余旁白）；true=显示「书面不印发…」类提示。
   */
  listeningOmittedStemShowAuthoringPolicyBanner: boolean;
  /**
   * 听力题书面卷 · 命题端「题干/听力稿」折叠核对区。
   * false=隐藏；true=显示（仍带 no-print，不进纸质卷）。
   */
  listeningOmittedStemShowAuthoringStemReveal: boolean;
  /**
   * 听力题书面卷 · 考场/学生端短提示（如「听录音作答…」）。
   * false=仅保留选项/作答线，无旁白。
   */
  listeningOmittedStemShowExamCue: boolean;
  /** 证明/解答/计算等书写区高度（表驱动，非题号硬编码） */
  answerWritingSpace: AnswerWritingSpaceConfig;
};

/** 卷面大题分组（连续同题型 → 一、二、…；跨学科，禁止按卷号写死） */
export type ExamPaperSectionsConfig = {
  groupByConsecutiveType: boolean;
  /**
   * true：合并相邻且题型展示键相同的大题（避免「一、选择题」「二、选择题」重复开栏）。
   * 命题 composition 拆成多行同型时也生效。
   */
  mergeAdjacentSameTypeSections?: boolean;
  chineseOrdinals: ReadonlyArray<string>;
  sectionTitleTemplate: string;
  sectionMetaTemplate: string;
  questionIndexTemplate: string;
  questionPointsTemplate: string;
  /** 大题标题底部分隔线；正式考卷排版默认 false（屏显/打印/PDF 同源） */
  sectionHeaderShowBottomBorder?: boolean;
  /**
   * 本题分值落点（相对题干/小问）：
   * - withoutSubquestions：无小问 → 与题干同行末
   * - withSubquestionsNoOwnPoints：有小问且未划小问分 → 跟在导语（preamble）末，小问之前（正式卷面常见）
   * - withSubquestionsOwnPoints：小问已自带分 → 省略本题总分避免重复
   */
  stemPointsPlacement?: {
    withoutSubquestions?: "inline_end" | "block_end" | "omit";
    withSubquestionsNoOwnPoints?: "inline_end" | "block_end" | "omit";
    withSubquestionsOwnPoints?: "inline_end" | "block_end" | "omit";
  };
  /** 识别「小问已划分分值」的正则（字符串形式，跨学科可扩展） */
  subquestionOwnPointsPatterns?: ReadonlyArray<string>;
  /**
   * 卷面已注入题号时，剥掉题干开头与该题号重复的 OCR/模型前缀（`{{n}}` = 题号数字）。
   * 仅匹配与 UI 题号同号的 `n.` / `第 n 题` 等，不剥小问 `（1）`。
   */
  stripRedundantStemIndexPatterns?: ReadonlyArray<string>;
};

export type ExamValidationMcqConfig = {
  /** 校验时拒绝语义重复选项（经规范化键比较） */
  rejectDuplicateOptions: boolean;
  /** 入库 sanitize 时静默去重（保留首次） */
  dedupeOnPersist: boolean;
  /** 生成 normalize 阶段静默去重；默认 false，以便校验能记入改进事件 */
  dedupeOnNormalize: boolean;
  /** 卷面展示时静默去重（保留首次） */
  dedupeOnDisplay: boolean;
};

export type ExamQualityRemediationConfig = {
  actionIds: ReadonlyArray<string>;
  actionLabels: Record<string, string>;
  issueActionHints: ReadonlyArray<{
    issueCodePattern: string;
    suggestedActions: ReadonlyArray<string>;
  }>;
  stripTrackTagPatterns: ReadonlyArray<string>;
  /**
   * 布置闸门：仅 status ∈ requireStatuses 且（可选）未 exclude 的卷可布置。
   * 禁止按学科分支；名单来自配置。
   * passOverridesExcludeAssign：已通过则忽略陈旧 exclude（避免通过后锁面板无法恢复可布置）。
   * clearExcludeAssignOnPass：写入 pass 时清掉 exclude。
   */
  assignGate: {
    requireStatuses: ReadonlyArray<string>;
    blockWhenExcludeAssign: boolean;
    passOverridesExcludeAssign?: boolean;
    clearExcludeAssignOnPass?: boolean;
    rejectMessage: string;
  };
  /** 验证锁定：status ∈ lockedStatuses 时不展示验证面板，且不可再跑「验证试卷」 */
  validateLock: {
    lockedStatuses: ReadonlyArray<string>;
    rejectMessage: string;
  };
  regenerate: {
    maxQuestionsPerRun: number;
    systemExtra: string;
    userTemplate: string;
    /** 修题 AI 失败笔记后缀（指向改进建议） */
    recordedToLearningSuffix: string;
    /** 命中时改用默认命题模型（不按学科映射）再试一次 */
    retryWithDefaultModelOnPatterns: ReadonlyArray<string>;
    retryWithDefaultModelNote: string;
  };
  /**
   * 库内「验证试卷」→ generationLearning 闭环（与命题失败学习共用候选池）。
   * 不改闸门真源；仅脱敏记事件，达阈值后自动同意注入后续命题/修题。
   */
  learningFromValidate?: {
    enabled?: boolean;
    /** fail 时把 quality_report.issues 记入 events（默认 true） */
    recordFailIssues?: boolean;
    /** 修题时注入已批准 learning hints（默认 true） */
    injectHintsOnRegenerate?: boolean;
  };
  /**
   * 验证时确定性展示卫生：heal → 写回 → 语义闸门 → 残留记报告。
   * failOnUnhealed=false：修不掉的记 warning，不单独导致无法布置。
   */
  displayHygieneOnValidate?: {
    enabled?: boolean;
    persistRepairs?: boolean;
    failOnUnhealed?: boolean;
  };
};

/** 运行时 AI 失败 → 改进建议（ops_advisory，禁止注入命题 prompt） */
export type GenerationLearningRuntimeIssueRule = {
  match: string;
  issueCode: string;
  strategyId: string;
  kind: "ops_advisory" | "prompt_policy";
  summary: string;
};

export type GenerationLearningConfig = {
  runtimeIssueRules: ReadonlyArray<GenerationLearningRuntimeIssueRule>;
  /**
   * 自动同意：检查记录聚合到阈值后自动批准候选，无需人工点「启用」。
   * 仅白名单 kind；ops_advisory 可自动标为已同意但不注入命题 prompt。
   */
  autoAgree?: {
    enabled: boolean;
    /** 不同证据次数下限（默认与 LEARNING_CANDIDATE_MIN_EVIDENCE 对齐） */
    minEvidence?: number;
    /** 允许自动同意的规则种类 */
    kinds?: ReadonlyArray<"prompt_policy" | "ops_advisory">;
    /** 审计 actor 名 */
    actor?: string;
    /** 每次写入检查记录后立即尝试自动同意 */
    reevaluateOnRecord?: boolean;
    /** 读取已批准规则 / 管理列表前再扫一遍（消化历史 pending） */
    reevaluateOnRead?: boolean;
  };
};

/** 表驱动语义闸门（跨学科；禁止按卷号/题号写死） */
export type ExamSemanticGatesConfig = {
  enabled: boolean;
  alignment: {
    enabled: boolean;
    rules: ReadonlyArray<{
      id: string;
      whenGradeBands: ReadonlyArray<string>;
      forbidCorpusPatterns: ReadonlyArray<string>;
      message: string;
    }>;
  };
  solutionAnswerConflict: {
    enabled: boolean;
    rules: ReadonlyArray<{
      id: string;
      solutionPatterns: ReadonlyArray<string>;
      answerConflictPatterns: ReadonlyArray<string>;
      message: string;
    }>;
  };
  countMcqSuspiciousOptions: {
    enabled: boolean;
    stemPatterns: ReadonlyArray<string>;
    optionTypes: ReadonlyArray<string>;
    requireAllOptionsNumeric: boolean;
    maxOptionAbsValue: number;
    minOptionCount: number;
    message: string;
  };
  multiSelectAnswerLetters: {
    enabled: boolean;
    types: ReadonlyArray<string>;
    pluralStemPatterns: ReadonlyArray<string>;
    requireMultipleLettersWhenPluralStem: boolean;
    messageInvalid: string;
    messagePluralIncomplete: string;
  };
  domainPlugins: {
    enabled: boolean;
    physicsWeightAsMassTrap: {
      enabled: boolean;
      stemPatterns: ReadonlyArray<string>;
      weightNewtonPattern: string;
      frictionNewtonPattern: string;
      accelPattern: string;
      gApprox: number;
      answerNewtonPattern: string;
      toleranceAbs: number;
      message: string;
    };
    solutionMassFraction: {
      enabled: boolean;
      stemPatterns: ReadonlyArray<string>;
      initialMassPercentPattern: string;
      addMassPattern: string;
      evaporatePattern: string;
      answerPercentPattern: string;
      toleranceAbs: number;
      message: string;
    };
  };
};

export type TextNormalizationConfig = {
  stripZeroWidth: boolean;
  normalizeUnicodeSpaces: boolean;
  /** 仅用于选项比对键，不改写卷面展示原文 */
  fullwidthPunctToHalfwidthForCompare: boolean;
  fullwidthPunctMap: Record<string, string>;
  applyUnicodeNoiseOnPersist: boolean;
  applyUnicodeNoiseOnDisplay: boolean;
  applyOnOptionDedupKey: boolean;
  /** `$ \\frac{x}{y} $` → `$\\frac{x}{y}$，便于 remark-math 识别 */
  trimSpacedInlineMathDelimiters: boolean;
  /** 模型/OCR 漏写花括号的 \\ceA → $\\ce{A}$ */
  repairMalformedMhchemCe: boolean;
  /**
   * 将 \\ce{…} 展开为普通 KaTeX（计量下标 / 反应箭头），不依赖 mhchem 扩展。
   * 避免打包双份 katex 时 \\ce 红字露源码；按化学式通式展开，非按分子硬编码。
   */
  expandMhchemCeToPlainKatex: boolean;
  /**
   * `\text{H_2O}` / `\text{H\_2O}` 等公式被误包进文本模式时剥出（`\text` 内 `_` 不会成下标）。
   * 按「字母+计量下标」形态识别，非按分子硬编码。
   */
  unwrapFormulaLikeTextCommands: boolean;
  /**
   * 裸下标定界时允许前导计量系数（`2H_2O`、`2H_2`），否则系数后的式子露字面下划线。
   */
  wrapBareSubscriptAllowLeadingDigits?: boolean;
  /**
   * `n($H_2O$)` / `M($H_2O$)` → `$n(H_2O)$`（单字母量 + 括号内已定界公式合并）。
   */
  mergeLetterParenInlineMath?: boolean;
  /** JSON 双重转义：\\*\\* / \\`\\`\\` → Markdown 定界 */
  unwrapOverEscapedMarkdown: boolean;
  /**
   * 空围栏 / 「空围栏夹正文」规范化：去掉 ```\\n``` 灰胶囊噪点，
   * 并将夹在空围栏之间的样例正文收拢为合法 fenced code（编程题通用）。
   */
  normalizeEmptyMarkdownFences: boolean;
  /**
   * 短 $$…$$ / \\[…\\] 降为行内 $…$（无 aligned/多行时），
   * 避免题干句中公式把卷面拆成多块。
   */
  demoteEmbeddedDisplayMath: boolean;
  /** 超过此长度的 display 公式保留块级 */
  demoteEmbeddedDisplayMathMaxInnerLength: number;
  /** 卷面展示时将连续空行压到至多一段间隔 */
  collapseStemExtraBlankLines: boolean;
  /**
   * 将「独占一行的短公式」并回前后正文（EPL 按行拆段前必须执行，否则仍单独成段）。
   * 上一行若以句号结束则不合并，避免误伤独立展示式。
   */
  joinOrphanMathLines: boolean;
  /**
   * 围栏外将段落空行收为单换行，并收紧 **标签**： 后空隙（编程题输入/输出/样例）。
   */
  tightenStemBlankLines: boolean;
  /**
   * 显式乘号卷面形态：times=×（义务教育常用）；cdot=·；preserve=保留源命令不改写。
   * 适用于数学/物理/化学等学科，不按题号硬编码。
   */
  explicitMultiplyDisplay: "times" | "cdot" | "preserve";
  /**
   * JSON `\t` 吞噬 LaTeX 命令首字母后的残余 → 完整命令（如 riangle→triangle）。
   * 表驱动，禁止在业务里按单题补丁。
   */
  latexTabEatenCommandRepairs: ReadonlyArray<{
    eatenTail: string;
    command: string;
    requireOpenBrace?: boolean;
  }>;
  /**
   * 数学定界内（及 `cmd{` 全局）补回缺失的反斜杠：`cdot`→`\cdot`、`sqrt{`→`\sqrt{`。
   * 表驱动，禁止按题号/单卷硬编码。
   */
  bareLatexCommandRepairs: ReadonlyArray<{
    bare: string;
    command: string;
    requireOpenBrace?: boolean;
  }>;
  /**
   * 触发词后紧跟的编号明文方程（`1. x+y=7`）收成 `$$\begin{cases}…$$`。
   * 保守：须命中 trigger、方程行数在 [min,max]、行内已有 `=`。
   */
  numberedPlainEquationListToCases: {
    enabled: boolean;
    minEquations: number;
    maxEquations: number;
    triggerPatterns: readonly string[];
    equationLinePattern: string;
  };
  /**
   * 剥离命题提示词泄漏（如 `**(e.g. 如图)**`）。正则字符串表驱动。
   */
  promptLeakageStripPatterns: readonly string[];
  /**
   * 将 \\(…\\) / \\[…\\] 规范为 $…$ / $$…$$，供 remark-math 识别。
   * 避免卷面原样显示定界符，或被 wrapBare 包成 $\\(...\\)$ 导致 KaTeX 失败。
   */
  normalizeLatexDelimitersToDollar: boolean;
  /**
   * 修复畸形 Markdown 附图：(![/path.png])、![/path.png]（缺 (url)）→ ![](/path.png)。
   * 路径须像站点资源（以 / 开头或 http(s)），跨学科通用，不写死题号。
   */
  normalizeMalformedMarkdownImages: boolean;
  /**
   * true：将 $…$ / $$…$$ 内的换行压成空格，避免 EPL「按行拆段」把 cases/aligned
   * 拆碎导致卷面露出裸 \\begin{cases}（选项单行 cases 不受影响）。
   */
  collapseNewlinesInsideMathDelimiters: boolean;
  /**
   * true：题干命中三角形形态（figureGeneration.triangleTemplate.mentionPatterns）时，
   * 若 diagram_schema 点集明显不是三角形（>3 点），读卷抑制矢量图——禁止用错误四边形顶替。
   */
  suppressNonTriangleDiagramWhenStemMentionsTriangle: boolean;
  /**
   * 选择题题干末尾作答括号（如「x=（ ）」）前补空格、括号内保底空白。
   * 表驱动 blankPatterns，跨学科；不碰有内容的函数括号 f(x)。
   */
  mcqAnswerBlankParenSpacing: {
    enabled: boolean;
    /** 空括号形态（正则）；仅匹配括号内为空白的作答位 */
    blankPatterns: readonly string[];
    /** 括号前插入的间距（缺省一个半角空格） */
    spaceBefore: string;
    /**
     * 括号内填充（展示用）。推荐全角空格「　」，避免半角空格被后续空白折叠吃掉。
     */
    innerFill: string;
  };
};

/**
 * 听力音频生成：卷面「是否听力题」判定（表驱动，跨学科共用，禁止业务硬编码关键词）。
 */
export type ListeningGenerationConfig = {
  /** 题干/题型/标签/学科拼接后命中任一正则 → 视为听力类题 */
  questionDetectPatterns: readonly string[];
};

export type MathGeometryGridDimensionAliases = {
  /** grid.rows 同义字段名（表驱动） */
  rowsKeys: readonly string[];
  /** grid.cols 同义字段名（表驱动） */
  colsKeys: readonly string[];
  /** 成对尺寸字段名：值为 [rows,cols] / {rows,cols} / "m×n" */
  pairKeys: readonly string[];
  /** 成对字符串尺寸，须含两个捕获组 */
  pairPattern: string;
  /** 题干抽网格尺寸，须含两个捕获组 */
  stemSizePattern: string;
  /** 题干须同时命中才允许用 stem 尺寸补全 grid */
  stemGridMentionPattern: string;
};

export type SampleGridFigureConfig = {
  /** 题干须命中（网格类） */
  requirePatterns: readonly string[];
  /** 样例区起始标记 */
  sampleLeadPatterns: readonly string[];
  /** 样例区结束标记（不含） */
  sampleEndPatterns: readonly string[];
  /** 代码围栏捕获组 1 = 样例正文 */
  fenceCapturePatterns: readonly string[];
  /** 首行 m n K，三个捕获组 */
  headerLinePattern: string;
  /** 坐标行 r c / x y，两个捕获组 */
  pointLinePattern: string;
  maxRows: number;
  maxCols: number;
  maxObstacles: number;
  startLabel: string;
  endLabel: string;
  cell: number;
  originX: number;
  originY: number;
};

export type RandomWalkLatticeFigureConfig = {
  triggerPatterns: readonly string[];
  requirePatterns: readonly string[];
  originPatterns: readonly string[];
  /** 捕获组 1 = 步数 N */
  stepCountPatterns: readonly string[];
  maxN: number;
  originLabel: string;
  drawAxes: boolean;
  /** 轴对齐外接方框（较弱示意；默认关，优先曼哈顿） */
  drawBoundBox: boolean;
  /** 画出 |x|+|y|≤N 的格点 */
  drawLatticePoints: boolean;
  /** 画出曼哈顿可达菱形边界 */
  drawManhattanBound: boolean;
  /** true：数学 y 向上（SVG 取反） */
  yUp: boolean;
  cell: number;
};

/** 题干写明数字网格 + 起/终/障碍坐标的路径示意（非样例块） */
export type StemPathGridFigureConfig = {
  requirePatterns: readonly string[];
  /** 捕获组 1、2 = 坐标 */
  startPatterns: readonly string[];
  endPatterns: readonly string[];
  obstaclePatterns: readonly string[];
  /** 命中则按「格点网」理解尺寸（如 5×5 且坐标到 4 → 画 4×4 小格） */
  latticeCornerPatterns: readonly string[];
  /** 起点为「左下角」时 y 向上 */
  yUpWhenBottomLeftStart: boolean;
  startLabel: string;
  endLabel: string;
  obstacleLabel: string;
  maxSize: number;
  cell: number;
  originX: number;
  originY: number;
};

export type FigureGenerationConfig = {
  /**
   * 用户点「生成题图」(force) 时：对命中 optionalDiagramStemPatterns 的题干也尝试配图，
   * 即使没有「如图」/假 import-figures（避免剥离假链后几何题被误判为无需配图）。
   */
  tryOptionalDiagramOnForce: boolean;
  /**
   * 题干硬性依赖配图的形态（「如图」等，正则表驱动，跨学科）。
   * 命中 → 须有图；亦作为工具栏「生成题图」候选判据之一。
   */
  requireDiagramStemPatterns: readonly string[];
  /**
   * 可选配图题干形态（正则字符串，表驱动，禁止按题号硬编码）。
   * 命中且 force 时进入生成；非 force 仍仅「如图」/假链/已有 scene 才配图。
   */
  optionalDiagramStemPatterns: readonly string[];
  /**
   * math.geometry grid 尺寸字段别名与题干回填（仅同义/题干已给尺寸，禁止臆造行列）。
   */
  gridDimensionAliases: MathGeometryGridDimensionAliases;
  /**
   * 编程题等：从「样例输入」解析 m,n,K/起终点/障碍 → 网格示意（禁止臆造样例未给的尺寸）。
   */
  sampleGridFigure: SampleGridFigureConfig;
  /**
   * 明确步数 N 的网格随机游走：以原点为中心画有界示意（范围由 N 决定）。
   */
  randomWalkLatticeFigure: RandomWalkLatticeFigureConfig;
  /**
   * 题干路径网格：数字尺寸 + 起终/障碍坐标（禁止空网、禁止臆造坐标）。
   */
  stemPathGridFigure: StemPathGridFigureConfig;
  /**
   * 知识点标签形态（正则）：命中时可在 force 下尝试配图。
   * 与「一定要有图」无关——见 requireDiagramWhenKnowledgeTagMatches。
   */
  optionalDiagramKnowledgeTagPatterns: readonly string[];
  /**
   * false（默认）：知识点标签命中 ≠ 必须有图（如「图形与几何」下的纯计算题可不配图）。
   * true：标签命中视为硬性配图依赖（与「如图」同级闸门，慎开）。
   */
  requireDiagramWhenKnowledgeTagMatches: boolean;
  /**
   * false（默认）：禁止中置信关键词模板凑图（避免千题一面、与题干角/边矛盾）。
   * true：AI/事实解算失败时允许中置信模板（易错配）。
   */
  allowMediumConfidenceTemplateFallback: boolean;
  /**
   * true（默认）：非「如图」题且检测为高置信时，先用题干事实模板，再调 AI。
   * 避免 AI 自由 SVG / 未对齐 scene 画出锐角冒充直角、漏标边长。
   */
  preferHighConfidenceTemplateBeforeAi: boolean;
  /**
   * 模型常省略 type 或写在 kind 等别名上：解析前按表驱动补齐（禁止按卷/题硬编码）。
   * 可选；缺省时 heal 模块使用内置默认，避免崩溃。
   */
  elementTypeHeal?: DiagramElementTypeHealConfig;
  /** 配图 AI system 追加约束（强调每个 element 必须有 type） */
  aiScenePromptExtras?: readonly string[];
  /**
   * 直角三角形 / 边长标注模板规则（全部正则表驱动，禁止在业务代码写死语种关键词）。
   */
  triangleTemplate: TriangleFigureTemplateConfig;
};

/** 缺 type 时的字段别名 / 同义名 / 按键形态推断（跨 pack，表驱动） */
export type DiagramElementTypeStructuralInferRule = {
  /** 适用 pack；含 "*" 表示通配 */
  packs: readonly string[];
  type: string;
  /** 必须全部存在的键 */
  allKeys?: readonly string[];
  /** 至少存在一个的键 */
  anyKeys?: readonly string[];
  /** 任一组内键全部存在即可 */
  anyKeyGroups?: ReadonlyArray<readonly string[]>;
  /** 可选：原始 type/kind 字符串命中才选用（如 arrow vs segment） */
  requireTypeNameHintPattern?: string;
};

export type DiagramElementTypeHealConfig = {
  /** 从元素对象读取类型名的字段优先级 */
  typeFieldAliases: readonly string[];
  /** 类型同义名 → 规范 type（小写键） */
  typeNameAliases: Record<string, string>;
  /** 仍无 type 时按键形态推断；自上而下首条命中 */
  structuralInfer: ReadonlyArray<DiagramElementTypeStructuralInferRule>;
};

/** 三角形高置信模板：顶点 / 直角 / 边长均从配置正则抽取 */
export type TriangleFigureTemplateConfig = {
  /** 题干提及三角形（任一条命中即可） */
  mentionPatterns: readonly string[];
  /** 平行线形态（与 mention 同时命中 → medium） */
  parallelMentionPatterns: readonly string[];
  /** 抽取三顶点字母，须含 3 个捕获组 */
  vertexLabelPatterns: readonly string[];
  /** 未抽到顶点时的默认三字母（几何惯例，非单卷） */
  defaultVertexLabels: readonly [string, string, string];
  /** 抽取直角顶点，须含 1 个捕获组（字母） */
  rightAngleVertexPatterns: readonly string[];
  /** 抽取边长：捕获组1=两边字母，捕获组2=数值 */
  sideLengthPatterns: readonly string[];
  sideLengthStemNormalize: {
    stripLatexCommandPattern: string;
    stripDollar: boolean;
    equalsNormalizeFrom: readonly string[];
    colonNormalizeFrom: readonly string[];
  };
  /** SVG aria-label（机器可读，避免业务 UI 文案硬编码进渲染） */
  ariaLabelRight: string;
  ariaLabelPlain: string;
  /**
   * true：题干出现 sin/cos/tan(角) 时，在图上标出该锐角（弧+角标），
   * 不在图上写 sin/cos 字面（三角比由角与边关系体现）。
   */
  markTrigReferencedAngles: boolean;
  /** 从 sin(B)/\\cos B 等抽取角顶点字母（捕获组 1） */
  trigAngleVertexPatterns: readonly string[];
  /** 锐角弧半径（SVG 单位） */
  acuteAngleMarkRadius: number;
  /** 角标前缀（如 ∠）；空字符串则只标字母 */
  angleMarkLabelPrefix: string;
  /**
   * true：有直角 + 三角比所标锐角时，按课本习惯标对边/邻边/斜边
   * （相对该锐角；文案见 trigSideRoleLabels）。
   */
  markTrigSideRoles: boolean;
  trigSideRoleLabels: {
    opposite: string;
    adjacent: string;
    hypotenuse: string;
  };
  /** 同时有数值边长时的标注模板，占位 {length} {role} */
  trigSideRoleWithLengthFormat: string;
  /** 仅角色标注模板，占位 {role} */
  trigSideRoleOnlyFormat: string;
};

type ExamDomainConfig = {
  version: number;
  paperKinds: ReadonlyArray<{ id: string; label: string; group?: PaperKindGroup }>;
  difficulties: ReadonlyArray<{ id: Difficulty; label: string }>;
  importDefaults: {
    duration_min: number;
    total_score: number;
    difficulty: Difficulty;
    grade: string;
    subject: string;
  };
  generateDefaults: {
    duration_min: number;
    total_score: number;
    difficulty: Difficulty;
  };
  validation: {
    duration_min: { min: number; max: number };
    total_score: { min: number; max: number };
    mcq: ExamValidationMcqConfig;
    semanticGates: ExamSemanticGatesConfig;
  };
  qualityRemediation: ExamQualityRemediationConfig;
  generationLearning: GenerationLearningConfig;
  textNormalization: TextNormalizationConfig;
  site: { ogImageUrl: string };
  ai: { gatewayUrl: string };
  choiceOptionsLayout: ChoiceOptionsLayoutConfig;
  examPaperSections: ExamPaperSectionsConfig;
  paperSurfaceLayout: PaperSurfaceLayoutConfig;
  listeningGeneration: ListeningGenerationConfig;
  figureGeneration: FigureGenerationConfig;
  userFacingErrors: {
    fallback: string;
    devTraceFallback: string;
    maxRawLength: number;
    devTracePattern: string;
    rules: ReadonlyArray<{ match: string; message: string }>;
  };
  generatePageUi: {
    aiUnavailableTitle: string;
    aiUnavailableFallback: string;
    subjectModelEmptyCatalog: string;
    subjectModelUnmapped: string;
    subjectModelIncomplete: string;
    settingsLinkLabel: string;
    persistenceWarningTitle: string;
    persistenceWarningBeforeLink: string;
    persistenceWarningAfterLink: string;
  };
  /** 详情卷面：调试面板与缺图提示（禁止按卷号硬编码） */
  examDetailUi: {
    forensicsAndFigureOwnership: {
      requireImported: boolean;
      requireSearchFlag: string;
      enableInDevWithoutFlag: boolean;
    };
    showOfflineImportFigureCrops: boolean;
    missingFigureHints: {
      showQuestionCallout: boolean;
      /** 是否在选项下展示「选项图缺失」 */
      showPerOptionMissing: boolean;
      showPerOptionMissingWhenQuestionCallout: boolean;
      appendixLoadErrorLabel: string;
    };
    importParseBanner: {
      enabled: boolean;
    };
  };
  aiRuntimeProbe: {
    lovableGatewayReady: string;
    lovableGatewayMissing: string;
    localPingOk: string;
    probeFailedFallback: string;
  };
};

const cfg = examDomainJson as unknown as ExamDomainConfig;

export const EXAM_DOMAIN_CONFIG = cfg;

export const PAPER_KIND_OPTIONS = cfg.paperKinds;
export const PAPER_KIND_IDS = cfg.paperKinds.map((k) => k.id) as [
  (typeof cfg.paperKinds)[number]["id"],
  ...(typeof cfg.paperKinds)[number]["id"][],
];
export type PaperKindId = (typeof PAPER_KIND_IDS)[number];

export const PAPER_KIND_GROUP_LABELS: Record<PaperKindGroup, string> = {
  regular: "常规考试",
  entrance: "升学考试",
  contest: "学科竞赛",
};

/** 按分组排列的试卷场景（用于下拉 optgroup） */
export const PAPER_KIND_GROUPS: {
  group: PaperKindGroup;
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
}[] = (["regular", "entrance", "contest"] as const).map((group) => ({
  group,
  label: PAPER_KIND_GROUP_LABELS[group],
  options: PAPER_KIND_OPTIONS.filter((o) => (o.group ?? "regular") === group),
}));

export const DIFFICULTY_OPTIONS = cfg.difficulties;
export const DIFFICULTY_IDS = cfg.difficulties.map((d) => d.id) as [Difficulty, ...Difficulty[]];

export const IMPORT_DEFAULTS = cfg.importDefaults;
export const GENERATE_DEFAULTS = cfg.generateDefaults;
export const EXAM_VALIDATION = cfg.validation;
export const EXAM_VALIDATION_MCQ = cfg.validation.mcq;
export const EXAM_SEMANTIC_GATES = cfg.validation.semanticGates;
export const EXAM_QUALITY_REMEDIATION = cfg.qualityRemediation;
export const GENERATION_LEARNING = cfg.generationLearning;
export const TEXT_NORMALIZATION = cfg.textNormalization;
export const SITE_OG_IMAGE_URL = cfg.site.ogImageUrl;
export const AI_GATEWAY_URL = cfg.ai.gatewayUrl;
export const CHOICE_OPTIONS_LAYOUT = cfg.choiceOptionsLayout;
export const EXAM_PAPER_SECTIONS = cfg.examPaperSections;
export const PAPER_SURFACE_LAYOUT = cfg.paperSurfaceLayout;
export const LISTENING_GENERATION = cfg.listeningGeneration;
export const FIGURE_GENERATION = cfg.figureGeneration;
export const USER_FACING_ERRORS = cfg.userFacingErrors;
export const GENERATE_PAGE_UI = cfg.generatePageUi;
export const EXAM_DETAIL_UI = cfg.examDetailUi;
export const AI_RUNTIME_PROBE = cfg.aiRuntimeProbe;

export function paperKindLabel(id: string | undefined): string {
  if (!id?.trim()) return "—";
  const hit = PAPER_KIND_OPTIONS.find((o) => o.id === id);
  return hit?.label ?? id;
}

export function isPaperKindId(id: string): id is PaperKindId {
  return (PAPER_KIND_IDS as readonly string[]).includes(id);
}

export function isEntrancePaperKind(id: string | undefined): boolean {
  if (!id?.trim()) return false;
  const hit = PAPER_KIND_OPTIONS.find((o) => o.id === id);
  return hit?.group === "entrance";
}
