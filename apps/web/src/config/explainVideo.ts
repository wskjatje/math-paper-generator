import explainVideoJson from "./explain-video.json";

export type ExplainAbilityBandConfig = {
  id: string;
  label: string;
  maxNarrationCharsPerScene: number;
  maxScenes: number;
  maxTotalNarrationChars: number;
  maxDurationSec: number;
  forbiddenTerms: readonly string[];
  /** 口播须含配置声明的生活类比标记（如 L1） */
  requireLifeAnalogy?: boolean;
  /** 分档教学摘要，注入讲义 prompt */
  pedagogySummary?: string;
};

export type ExplainSkeletonConfig = {
  id: string;
  label: string;
  questionType: string;
  requiresTeacherLockAlways: boolean;
  scenePurposeSequence: readonly string[];
  allowedKnowledgeTags: readonly string[];
  allowedSubjectIds: readonly string[];
  secondsPerSceneDefault: number;
};

export type ExplainHandoutGenerationConfig = {
  mode: "ai" | "facts_transform";
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
  requireAnswerCoverage: boolean;
  requireStepCoverage: boolean;
  /**
   * 并入 Chat Completions 请求体（配置驱动）。
   * DeepSeek V4 默认思考模式易占满输出导致 content 为空；建议 thinking.type=disabled。
   */
  chatCompletionsExtras?: Record<string, unknown>;
  /** 能力档 id → 分档讲义补充说明（只进配置） */
  bandOverlays?: Record<string, string>;
  /** 判定「生活类比」的口播子串标记（配置表，禁止源码臆造） */
  lifeAnalogyMarkers?: readonly string[];
  /**
   * 可重试错误的最大尝试次数（含首次）。缺省 2。
   * 只认本配置，禁止源码另写死次数。
   */
  maxAttempts?: number;
};

export type ExplainFactsTemplate = {
  narration: string;
  onScreen: string;
};

export type ExplainBoardRenderConfig = {
  burnOnScreenText: boolean;
  fontFileEnv: string;
  fontFileCandidates: readonly string[];
  backgroundColor: string;
  fontColor: string;
  fontSize: number;
  marginX: number;
  marginY: number;
  lineSpacing: number;
  maxCharsPerLine: number;
  maxLines: number;
};

export type ExplainRenderBackend = "board_ffmpeg" | "manim_templates" | "code2video";
export type ExplainManimRuntime = "local" | "docker";

export type ExplainManimTemplatesConfig = {
  sceneTemplateMap: Record<string, string>;
};

export type ExplainManimRuntimeConfig = {
  localBinEnv: string;
  localBinName: string;
  dockerBinEnv: string;
  dockerBinName: string;
  dockerImage: string;
  quality: string;
  /** 相对仓库根的 Manim 脚本路径 */
  scriptRelPath: string;
  sceneModuleName: string;
  sceneClassName: string;
  workdirMount: string;
};

/** P0 成片增强：TTS 回退 / 字幕 / 合成闸门；broll 预留且默认关 */
export type ExplainRenderEnhanceConfig = {
  enabled: boolean;
  /** 允许的 TTS 引擎白名单（fail closed） */
  allowedTtsEngines: readonly string[];
  /** enabled 时按序尝试；全部失败才 fail；空则回退到 render.ttsEngine */
  ttsEngineFallback: readonly string[];
  subtitles: {
    enabled: boolean;
    burnIn: boolean;
    /** true：烧录失败整片失败；false：烧录失败则输出无字幕成片（须显式配置） */
    requireBurnIn?: boolean;
    maxCharsPerCue: number;
    maxLinesPerCue: number;
  };
  synth: {
    concatMaxAttempts: number;
    minOutputBytes: number;
    minDurationSec: number;
    ffprobeBinEnv: string;
    ffprobeBinName: string;
  };
  broll: {
    enabled: boolean;
    provider: string;
    allowedPurposes: readonly string[];
    forbiddenPurposes: readonly string[];
    skipOnFailure: boolean;
  };
};

export type ExplainVideoConfig = {
  enabled: boolean;
  routePath: string;
  navLabel: string;
  publicKind: string;
  storageKeyTemplate: string;
  scriptJsonName: string;
  modelPurposes: { itemGen: string; scriptGen: string };
  quantity: { min: number; max: number };
  difficulties: readonly string[];
  /** 卷面题型 id → 骨架 id（配置表，禁止源码写死映射） */
  questionTypeSkeletonMap: Record<string, string>;
  /** 一键流水线默认能力档（须存在于 abilityBands） */
  defaultAbilityBandId?: string;
  /** 试卷选题：无法解析年级时是否允许 gen_unbound（配置开关，禁止源码臆造年级） */
  allowUnboundGradeFromExam?: boolean;
  /** 试卷选题：是否强制题上已有知识点标签 */
  requireKnowledgeTagFromExam?: boolean;
  /** 选题列表题干预览最大字符（保留公式定界符供前端渲染） */
  stemPreviewMaxChars?: number;
  /** 讲义 AI：只校验接口能力；模型条目由设置 purposeModelEntryIds 指定 */
  scriptGenModelSelection?: {
    requireOpenAiCompatEndpoint?: boolean;
    unsupportedModelIdPatterns?: readonly string[];
  };
  /** 用途键 → 设置页展示名（键与 modelPurposes 值对齐） */
  modelPurposeLabels?: Record<string, string>;
  handoutGeneration?: ExplainHandoutGenerationConfig;
  factsTransformTemplates?: Record<string, ExplainFactsTemplate>;
  scenePurposes: readonly string[];
  abilityBands: readonly ExplainAbilityBandConfig[];
  skeletons: readonly ExplainSkeletonConfig[];
  /** 内部状态码 → 默认层中文（禁止 UI 硬编码长串） */
  statusLabels?: Record<string, string>;
  render: {
    /** M1 验收前默认 board_ffmpeg；产品主成片为 manim_templates */
    backend?: ExplainRenderBackend;
    /** 必须为 false；失败禁止静默换后端 */
    allowBackendFallback?: boolean;
    manimRuntime?: ExplainManimRuntime;
    ffmpegBinEnv: string;
    ffmpegBinName: string;
    ttsEngine: string;
    piperBinEnv: string;
    piperModelEnv: string;
    frameWidth: number;
    frameHeight: number;
    fps: number;
    silencePadSec: number;
    board?: ExplainBoardRenderConfig;
    manimTemplates?: ExplainManimTemplatesConfig;
    manim?: ExplainManimRuntimeConfig;
  };
  /** P0 增强；缺省或 enabled=false 时保持单引擎 TTS、无字幕增强 */
  renderEnhance?: ExplainRenderEnhanceConfig;
  messages: Record<string, string>;
};

export const EXPLAIN_VIDEO = explainVideoJson as ExplainVideoConfig;

export function explainVideoMessage(key: string): string {
  const m = EXPLAIN_VIDEO.messages[key]?.trim();
  if (!m) throw new Error(`explain-video.json messages 缺少键：${key}`);
  return m;
}

export function findExplainAbilityBand(id: string): ExplainAbilityBandConfig | undefined {
  return EXPLAIN_VIDEO.abilityBands.find((b) => b.id === id);
}

export function findExplainSkeleton(id: string): ExplainSkeletonConfig | undefined {
  return EXPLAIN_VIDEO.skeletons.find((s) => s.id === id);
}

/** 按卷面题型解析骨架；无映射或骨架不存在则 undefined（调用方须 fail closed） */
export function findExplainSkeletonIdForQuestionType(
  questionType: string,
): string | undefined {
  const sid = EXPLAIN_VIDEO.questionTypeSkeletonMap[questionType]?.trim();
  if (!sid) return undefined;
  return findExplainSkeleton(sid) ? sid : undefined;
}

/** 合同默认能力档；缺键或 id 无效则 undefined（fail closed） */
export function resolveDefaultExplainAbilityBandId(): string | undefined {
  const id = EXPLAIN_VIDEO.defaultAbilityBandId?.trim();
  if (!id) return undefined;
  return findExplainAbilityBand(id) ? id : undefined;
}

/**
 * 多选能力档：去重保序；空则回落 defaultAbilityBandId。
 * 任一 id 不在 abilityBands → throw（fail closed，禁止猜档）。
 */
export function normalizeExplainBandIds(bandIds?: string[] | string): string[] {
  const rawList: string[] = Array.isArray(bandIds)
    ? bandIds
    : typeof bandIds === "string"
      ? [bandIds]
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawList) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) {
    const def = resolveDefaultExplainAbilityBandId();
    if (!def) throw new Error(explainVideoMessage("defaultBandMissing"));
    return [def];
  }
  for (const id of out) {
    if (!findExplainAbilityBand(id)) {
      throw new Error(explainVideoMessage("bandIdInvalid"));
    }
  }
  return out;
}

/** 档案绑档：空/空白 → null；非空须为配置内 band id */
export function normalizeExplainAbilityBandIdOrNull(
  bandId: string | null | undefined,
): string | null {
  const id = bandId?.trim() || null;
  if (!id) return null;
  if (!findExplainAbilityBand(id)) {
    throw new Error(explainVideoMessage("bandIdInvalid"));
  }
  return id;
}

/** 一键多档进度：如「巩固：成片中」。模板只进配置。 */
export function formatExplainOneClickBandProgress(
  bandLabel: string,
  phaseStatus: string,
): string {
  const phase =
    EXPLAIN_VIDEO.statusLabels?.[phaseStatus]?.trim() ||
    explainVideoMessage("oneClickInProgress");
  const tpl = EXPLAIN_VIDEO.messages.oneClickBandProgress?.trim();
  if (!tpl) return `${bandLabel}：${phase}`;
  return tpl.replaceAll("{{bandLabel}}", bandLabel).replaceAll("{{phaseLabel}}", phase);
}
