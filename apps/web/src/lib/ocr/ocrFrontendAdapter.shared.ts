/**
 * OCR Frontend Governance Contract (Phase 1).
 *
 * GOT-OCR 2.0 = canonical producer；须适配为
 * {@link StructuredExamOcrDocument} and emit observational degradation only.
 *
 * Authoritative writes (figure_refs, registry bind, linker selection) stay in
 * downstream canonical pipeline — never in adapter output.
 *
 * ## Canonical ≠ “最好”
 *
 * `role: "canonical"` 表示 **当前治理基线已批准的 frontend**（可 replay、可 bench、可晋升），
 * 并不表示“识别最准 / 最聪明 / 最先进”。将 experimental 升为 canonical 须走：
 * dual-run corpus → taxonomy drift report → intentional drift review → governance approval。
 */
import type { StructuredExamOcrDocument } from "@/lib/ocr/types";

export const OCR_FRONTEND_ADAPTER_VERSION = "v1" as const;

export type OcrEngineId = "got";

export type OcrFrontendRole = "canonical" | "experimental";

/** Adapter 可观测降级症状（映射 failure-taxonomy.v1.json） */
export type OcrFrontendAdapterSymptomV1 =
  | "degraded_layout_observability"
  | "no_diagram_links_materialization_hint"
  | "ocr_topology_drift"
  | "question_split_mismatch"
  | "experimental_frontend_only"
  | "adapter_not_implemented";

export type OcrFrontendTopologyGuaranteesV1 = {
  /** 是否存在任意有效 bbox（w,h > 2） */
  bbox_support: boolean;
  /** 是否存在 diagram_links */
  diagram_links_support: boolean;
  /** 是否存在非空 blocks */
  blocks_nonempty: boolean;
  /** questions 条目与正文题号锚点是否粗一致 */
  question_split_aligned: boolean;
};

export type OcrFrontendMarkdownGuaranteesV1 = {
  plain_text_nonempty: boolean;
  plain_text_len: number;
};

/**
 * 写入 `import_parse_quality.ocr_frontend`（observational；非 authoritative）。
 */
export type OcrFrontendProvenanceV1 = {
  version: 1;
  engine: OcrEngineId;
  adapter_version: typeof OCR_FRONTEND_ADAPTER_VERSION;
  role: OcrFrontendRole;
  topology: OcrFrontendTopologyGuaranteesV1;
  markdown: OcrFrontendMarkdownGuaranteesV1;
  /** 0–1 粗粒度拓扑可信度（非 ML 分数） */
  topology_confidence: number;
  adapter_symptoms: OcrFrontendAdapterSymptomV1[];
  /** experimental 前端不得作为 canonical 入库路径 */
  authoritative: false;
  /** 双跑 / bench 归因用 */
  observed_at: string;
};

export type OcrFrontendAdapterResultV1 = {
  version: 1;
  /** 必须已进入 canonical IR；禁止跳过 */
  document: StructuredExamOcrDocument;
  provenance: OcrFrontendProvenanceV1;
};

/** @deprecated 仅保留 got；`MPG_OCR_ENGINE` 非 got 时仍返回 got */
export function resolveOcrEngineFromEnv(_env: NodeJS.ProcessEnv = process.env): OcrEngineId {
  return "got";
}

function bboxArea(b: [number, number, number, number]): number {
  const w = Math.abs(b[2] - b[0]);
  const h = Math.abs(b[3] - b[1]);
  return w * h;
}

function blocksOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  if (x1 <= x0 || y1 <= y0) return false;
  const inter = (x1 - x0) * (y1 - y0);
  const minArea = Math.min(bboxArea(a), bboxArea(b));
  return minArea > 0 && inter / minArea > 0.55;
}

function countPartAnchors(text: string): number {
  const re = /[（(]\s*\d{1,2}\s*[）)]/g;
  let n = 0;
  while (re.exec(text)) n += 1;
  return n;
}

/**
 * 从 canonical IR 评估 adapter 保证与降级症状（确定性，可 replay）。
 */
export function evaluateStructuredExamOcrFrontend(
  doc: StructuredExamOcrDocument,
  meta: {
    engine: OcrEngineId;
    role: OcrFrontendRole;
    extra_symptoms?: OcrFrontendAdapterSymptomV1[];
  },
): OcrFrontendAdapterResultV1 {
  const symptoms: OcrFrontendAdapterSymptomV1[] = [...(meta.extra_symptoms ?? [])];

  const validBboxes = doc.blocks.filter((b) => bboxArea(b.bbox) > 4);
  const bbox_support = validBboxes.length > 0;
  const diagram_links_support = (doc.diagramLinks?.length ?? 0) > 0;
  const blocks_nonempty = doc.blocks.length > 0;

  if (!bbox_support) symptoms.push("degraded_layout_observability");
  if (!diagram_links_support) symptoms.push("no_diagram_links_materialization_hint");

  let overlapPairs = 0;
  for (let i = 0; i < validBboxes.length; i++) {
    for (let j = i + 1; j < validBboxes.length; j++) {
      if (blocksOverlap(validBboxes[i]!.bbox, validBboxes[j]!.bbox)) overlapPairs += 1;
    }
  }
  if (overlapPairs > 0) symptoms.push("ocr_topology_drift");

  const anchorCount = countPartAnchors(doc.plainText);
  const qCount = doc.questions.length;
  const question_split_aligned =
    anchorCount === 0 || qCount === 0
      ? true
      : Math.abs(anchorCount - qCount) <= Math.max(1, Math.floor(anchorCount * 0.35));
  if (!question_split_aligned) symptoms.push("question_split_mismatch");

  if (meta.role === "experimental") symptoms.push("experimental_frontend_only");

  const uniqSymptoms = [...new Set(symptoms)];

  let topology_confidence = 1;
  if (!bbox_support) topology_confidence -= 0.35;
  if (!diagram_links_support) topology_confidence -= 0.25;
  if (overlapPairs > 0) topology_confidence -= 0.2;
  if (!question_split_aligned) topology_confidence -= 0.15;
  if (meta.role === "experimental") topology_confidence = Math.min(topology_confidence, 0.45);
  topology_confidence = Math.max(0, Math.min(1, topology_confidence));

  const provenance: OcrFrontendProvenanceV1 = {
    version: 1,
    engine: meta.engine,
    adapter_version: OCR_FRONTEND_ADAPTER_VERSION,
    role: meta.role,
    topology: {
      bbox_support,
      diagram_links_support,
      blocks_nonempty,
      question_split_aligned,
    },
    markdown: {
      plain_text_nonempty: doc.plainText.trim().length > 0,
      plain_text_len: doc.plainText.length,
    },
    topology_confidence,
    adapter_symptoms: uniqSymptoms,
    authoritative: false,
    observed_at: new Date().toISOString(),
  };

  return {
    version: 1,
    document: { ...doc, engine: meta.engine },
    provenance,
  };
}

/** Taxonomy class id 建议（与 failure-taxonomy.v1.json 对齐） */
export function parseOcrFrontendProvenanceV1(raw: unknown): OcrFrontendProvenanceV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as OcrFrontendProvenanceV1;
  if (o.version !== 1 || o.authoritative !== false) return null;
  if (o.engine !== "got") return null;
  if (o.role !== "canonical" && o.role !== "experimental") return null;
  if (!Array.isArray(o.adapter_symptoms)) return null;
  return o;
}

export function taxonomyClassForAdapterSymptom(
  symptom: OcrFrontendAdapterSymptomV1,
): string | null {
  switch (symptom) {
    case "degraded_layout_observability":
      return "degraded_layout_observability";
    case "no_diagram_links_materialization_hint":
      return "no_materialization";
    case "ocr_topology_drift":
      return "ocr_topology_drift";
    case "question_split_mismatch":
      return "ownership_scope_missing";
    case "experimental_frontend_only":
      return "experimental_ocr_frontend";
    case "adapter_not_implemented":
      return "experimental_ocr_frontend";
    default:
      return null;
  }
}
