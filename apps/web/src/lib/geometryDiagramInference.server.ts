/**
 * 根据题干文本推断学科示意图 JSON（矢量重绘），供入库 questions[].diagram_schema。
 * 覆盖数学几何及理化生等需空间结构的题干（同一 JSON 形状；不含扫描图）。
 */
import { jsonrepair } from "jsonrepair";

import { callChatCompletions } from "@/lib/exam-generation.server";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { Exam, Question } from "@/lib/types";
import { normalizeSubjectIdForModelMap } from "@/lib/aiRuntime.shared";
import { tryRuleBasedDiagramSchema } from "@/lib/geometry/geometryRuleInference.shared";
import {
  safeParseGeometryDiagramSchema,
  type GeometryDiagramSchemaV1,
} from "@/lib/geometryDiagramSchema.shared";
import {
  questionHasConcreteVisualGeometryEvidence,
  shouldSuppressVectorDiagramSchemaForQuestion,
} from "@/lib/examRasterFigureHints.shared";

function readAssistantContent(data: Record<string, unknown>): string | undefined {
  const choicesRaw = data["choices"];
  if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) return undefined;
  const choice = choicesRaw[0];
  if (!choice || typeof choice !== "object") return undefined;
  const message = (choice as Record<string, unknown>)["message"];
  if (!message || typeof message !== "object") return undefined;
  const c = (message as Record<string, unknown>)["content"];
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const texts = c
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const o = part as { type?: string; text?: string };
        return o.type === "text" && o.text ? o.text : "";
      })
      .filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  return undefined;
}

function parseJsonLenient(text: string): unknown {
  const t = text
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "");
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(jsonrepair(t));
    } catch {
      return undefined;
    }
  }
}

/** 数学几何 */
const GEOMETRY_HEURISTIC =
  /[△∠⊥∥⊙◎○□▱▭]|三角形|四边形|平行四边形|矩形|正方形|射线|圆弧|圆心|垂直|平分|全等|相似|尺规/i;
/** 理化生与通用「需看图」表述 */
const STEM_DIAGRAM_HEURISTIC =
  /如图所示|如下图|下图|上图|装置图|示意图|实验装置|受力|合力|分力|摩擦力|电场|电场线|磁场|磁感线|电路|电压|电流|电阻|电源|导线|开关|灯泡|滑动变阻器|串联|并联|凸透镜|凹透镜|平面镜|光路|折射|反射|成像|匀变速|匀速|v[-−—]?t|x[-−—]?t|坐标系|函数图像|轨迹|试管|烧杯|锥形瓶|酒精灯|集气瓶|导管|显微镜|细胞/i;

export function stemLooksDiagramWorthy(content: string): boolean {
  const t = content.replace(/\s+/g, " ").trim().slice(0, 1200);
  // 纯科学记数法/数值表示类、无显式「如图」：不触发矢量示意图推断
  if (
    /科学记数法|科学计数法|用\s*科学/.test(t) &&
    !GEOMETRY_HEURISTIC.test(t) &&
    !/如图所示|如图[，,]|如下图|上图|右图|下图/.test(t)
  ) {
    return false;
  }
  return GEOMETRY_HEURISTIC.test(t) || STEM_DIAGRAM_HEURISTIC.test(t);
}

/** @deprecated 语义已扩展为全学科示意图判定，请优先使用 {@link stemLooksDiagramWorthy} */
export function stemLooksGeometric(content: string): boolean {
  return stemLooksDiagramWorthy(content);
}

const SYSTEM_PROMPT = `你是「学科示意图」结构抽取器（数学 / 物理 / 化学 / 生物等）。用户给出一段中文题干（可能含 LaTeX）。
若题干几乎不需要空间结构图（纯代数计算、单纯词语辨析、无位置关系等），输出 {"skip":true}。
否则用同一套 JSON 描述矢量示意图（坐标系：逻辑画布默认宽 100、高 100；点坐标用 0–100 的数，大致美观即可）：
{
  "version": "1",
  "points": [ { "id": "A", "x": 20, "y": 75, "label": "A" }, ... ],
  "segments": [ ["A","B"], ["B","C"] ],
  "circles": [ { "center": "O", "radius": 18 } ]  // 可选；也可用 { "center":"A","through":"B" }
}
跨学科用法提示（仍只用 points / segments / circles / arcs / segments_dashed）：
- 数学：三角形、圆、垂直平行等与课本一致。
- 物理：受力可用线段表示力矢（标签写在点的 label 或相邻段旁）；简单光路、电路可用点表示接线柱/元件节点，线段表示导线或光线。
- 化学/生物：装置示意可用矩形区域的折线近似（多点连线），不必追求写实。
要求：
- id 用简短拉丁字母或数字后缀，与题干符号一致。
- segments 为直线段；箭头类可在题干语义下用线段 + 标签表示。
- 不要输出 Markdown、不要输出理由。
- 只输出一个 JSON 对象。`;

/** `full`：规则命中优先，否则 LLM 推断坐标；`rule_only`：仅规则约束布局（线下导入场景），不调模型 */
export type GeometryDiagramInferenceMode = "full" | "rule_only";

export type InferDiagramFromStemOptions = {
  mode?: GeometryDiagramInferenceMode;
  /** 题目学科/课程标签（如 物理、化学），用于模型侧路由与提示 */
  subjectHint?: string;
  /**
   * 为 false 时跳过 LLM 坐标推断（仍执行 {@link tryRuleBasedDiagramSchema}）。
   * 导入卷无卷面位图时应为 false，避免「仅从题干猜图」；命题生成等场景缺省为 true。
   */
  allowLlmGeometryInference?: boolean;
};

/**
 * 单次题干 → diagram_schema；失败或无需配图返回 null。
 */
export async function inferGeometryDiagramFromStem(
  stem: string,
  ai: AiRuntimePayload | undefined,
  options?: InferDiagramFromStemOptions,
): Promise<GeometryDiagramSchemaV1 | null> {
  const inferenceMode = options?.mode ?? "full";
  const compact = stem.replace(/\s+/g, " ").trim().slice(0, 6000);
  if (!compact || !stemLooksDiagramWorthy(compact)) return null;

  const ruleSchema = tryRuleBasedDiagramSchema(compact);
  if (ruleSchema) return ruleSchema;

  if (inferenceMode === "rule_only") return null;
  if (options?.allowLlmGeometryInference === false) return null;

  const subjectLine = options?.subjectHint?.trim()
    ? `（学科/课程：${options.subjectHint.trim()}）\n\n`
    : "";
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${subjectLine}题干如下：\n\n${compact}`,
      },
    ],
    max_tokens: 900,
    temperature: 0.2,
  };
  const aiMode = ai?.mode ?? "cloud";
  if (aiMode !== "local") {
    body.response_format = { type: "json_object" };
  }

  const subjectId = normalizeSubjectIdForModelMap(options?.subjectHint) ?? "math";
  const data = await callChatCompletions(body, ai, { purpose: "exam", subjectId });
  const text = readAssistantContent(data)?.trim();
  if (!text) return null;
  const parsed = parseJsonLenient(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.skip === true) return null;
  return safeParseGeometryDiagramSchema(parsed);
}

const MAX_INFER_QUESTIONS = 24;

/**
 * 为快照中尚未带 diagram_schema 的几何题批量推断（顺序执行，降低并发压力）。
 */
export async function fillGeometryDiagramsForSnapshot(
  snapshot: SessionExamSnapshot,
  ai: AiRuntimePayload | undefined,
  options?: { mode?: GeometryDiagramInferenceMode },
): Promise<SessionExamSnapshot> {
  const inferMode = options?.mode ?? "full";
  const questions: Question[] = snapshot.questions.map((q) => ({ ...q }));
  let n = 0;
  for (let i = 0; i < questions.length && n < MAX_INFER_QUESTIONS; i++) {
    const q = questions[i]!;
    if (q.diagram_schema) continue;
    if (shouldSuppressVectorDiagramSchemaForQuestion(q)) continue;
    const content = String(q.content ?? "");
    if (!stemLooksDiagramWorthy(content)) continue;
    try {
      const allowLlm =
        snapshot.exam.source !== "imported" ||
        questionHasConcreteVisualGeometryEvidence(q);
      const schema = await inferGeometryDiagramFromStem(content, ai, {
        mode: inferMode,
        subjectHint: String(q.subject ?? ""),
        allowLlmGeometryInference: allowLlm,
      });
      if (schema) {
        questions[i] = { ...q, diagram_schema: schema };
        n++;
      }
    } catch {
      /* 单题失败不影响整卷 */
    }
  }
  return { ...snapshot, questions };
}

/** 仅占位：{@link fillGeometryDiagramsForSnapshot} 只读 questions，exam 不参与推断 */
const DIAGRAM_INFERENCE_EXAM_STUB: Exam = {
  id: "__diagram-inference-stub__",
  title: "",
  subtitle: null,
  subjects: [],
  difficulty: "intermediate",
  duration_min: 60,
  total_score: 100,
  source: "generated",
  is_featured: false,
  description: null,
  created_at: new Date().toISOString(),
};

/**
 * 命题入库专用：在 AI 已返回的题目列表上，为仍缺少 `diagram_schema` 的几何题干补充矢量示意图。
 */
export async function fillGeometryDiagramsForQuestionList(
  questions: Question[],
  ai: AiRuntimePayload | undefined,
  options?: { mode?: GeometryDiagramInferenceMode },
): Promise<Question[]> {
  const snap = await fillGeometryDiagramsForSnapshot(
    {
      exam: DIAGRAM_INFERENCE_EXAM_STUB,
      questions: questions.map((q) => ({ ...q })),
      examples: [],
    },
    ai,
    options,
  );
  return snap.questions;
}
