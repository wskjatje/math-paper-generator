/**
 * Educational text canonicalization compiler (deterministic lowering).
 *
 * Constitutional invariant: preview authority === persist authority
 * ({@link normalizeFaithfulOcrPreviewText} and {@link normalizeOfflineImportOcrTextForPersist}).
 *
 * Phases are observational / forensic — not authoritative ownership or linker binds.
 */
import {
  normalizeGotOcrLatexBlankMarkers,
  normalizeOcrFillBlankMarkers,
  normalizeCoordinatePlaneOcrText,
  stripGotOcrDiagramLabelRunaway,
  stripGotOcrTitleNoise,
} from "@/lib/offlineExamCoordinateOcrNormalize.shared";
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";
import { runEnumerationSemanticReconstruction } from "@/lib/educationalEnumerationReconstruction.shared";
import { runGeometrySemanticRejoin } from "@/lib/educationalGeometrySemanticRejoin.shared";
import { normalizeMathExamOcrText } from "@/lib/offlineExamOcrNormalize.shared";

export const EDUCATIONAL_CANONICALIZATION_AUTHORITY = "preview_and_persist_unified" as const;

/** Forensic replay 版本标签（规则链变更时递增） */
export const CANONICALIZATION_RUNTIME_VERSION = "v3" as const;

export type CanonicalizationPhaseIdV1 =
  | "ocr_raw"
  | "transport_glyph_repair"
  | "diagram_hallucination_strip"
  | "geometry_notation_normalize"
  | "geometry_semantic_rejoin"
  | "enumeration_semantic_reconstruction"
  | "math_exam_lowering"
  | "canonical_text";

export type EpistemicClassV1 = "deterministic" | "probabilistic" | "generative";

export type CanonicalizationPhaseMetaV1 = {
  label: string;
  epistemic_class: EpistemicClassV1;
  deterministic: boolean;
  provenance: string;
};

export const CANONICALIZATION_PHASE_META: Record<
  CanonicalizationPhaseIdV1,
  CanonicalizationPhaseMetaV1
> = {
  ocr_raw: {
    label: "OCR 原文",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "got_ocr.transport",
  },
  transport_glyph_repair: {
    label: "字形 / 题头 / 填空 transport",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.transport_glyph_repair",
  },
  diagram_hallucination_strip: {
    label: "图区轴标幻觉截断",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.diagram_hallucination_strip",
  },
  geometry_notation_normalize: {
    label: "几何符号 / 图注",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.geometry_notation_normalize",
  },
  geometry_semantic_rejoin: {
    label: "几何 LaTeX 语义缝合",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.geometry_semantic_rejoin",
  },
  enumeration_semantic_reconstruction: {
    label: "小问层级枚举重建",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.enumeration_semantic_reconstruction",
  },
  math_exam_lowering: {
    label: "试卷数学 lowering",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.math_exam_lowering",
  },
  canonical_text: {
    label: "canonical text（冻结边界）",
    epistemic_class: "deterministic",
    deterministic: true,
    provenance: "compiler.canonical_text",
  },
};

export type CanonicalizationEditV1 = {
  phase: CanonicalizationPhaseIdV1;
  epistemic_class: EpistemicClassV1;
  deterministic: boolean;
  provenance: string;
  /** 稳定规则 id（非模型）；用于 forensic 与 bench */
  rule_id: string;
  before: string;
  after: string;
  confidence: number;
};

export type CanonicalizationPhaseTraceV1 = {
  phase: CanonicalizationPhaseIdV1;
  epistemic_class: EpistemicClassV1;
  deterministic: boolean;
  provenance: string;
  input_len: number;
  output_len: number;
  changed: boolean;
  edits: CanonicalizationEditV1[];
};

export type EducationalTextCanonicalizationTraceV1 = {
  version: 1;
  authority: typeof EDUCATIONAL_CANONICALIZATION_AUTHORITY;
  coordinate_plane_detected: boolean;
  phases: CanonicalizationPhaseTraceV1[];
  canonical_text_len: number;
};

const MAX_EDITS_PER_PHASE = 12;
const SAMPLE_LEN = 96;

function sampleEdit(
  phase: CanonicalizationPhaseIdV1,
  before: string,
  after: string,
  ruleId: string,
  confidence = 1,
): CanonicalizationEditV1 | null {
  if (before === after) return null;
  const meta = CANONICALIZATION_PHASE_META[phase];
  const trim = (s: string) =>
    s.length <= SAMPLE_LEN ? s : `${s.slice(0, SAMPLE_LEN)}…`;
  return {
    phase,
    epistemic_class: meta.epistemic_class,
    deterministic: meta.deterministic,
    provenance: `${meta.provenance}/${ruleId}`,
    rule_id: ruleId,
    before: trim(before),
    after: trim(after),
    confidence,
  };
}

function collectSubstringEdits(
  phase: CanonicalizationPhaseIdV1,
  before: string,
  after: string,
  ruleId: string,
  confidence = 1,
): CanonicalizationEditV1[] {
  const edits: CanonicalizationEditV1[] = [];
  if (before === after) return edits;

  const one = sampleEdit(phase, before, after, ruleId, confidence);
  if (one) edits.push(one);

  const patterns: Array<{ re: RegExp; id: string }> = [
    { re: /5V3/gi, id: "sqrt_v_to_radical" },
    { re: /A408|A\s*408/gi, id: "triangle_digit_four_compact" },
    { re: /如图\s*[\(（]\s*1\s*[\)）]/g, id: "figure_label_paren_to_circled" },
    { re: /图\s*[\(（]\s*2\s*[\)）]/g, id: "figure_label_paren_to_circled" },
    { re: /\\?\(\s*\\cdot\s*\\?\)/g, id: "latex_cdot_blank" },
    { re: /\\?\(\s*\\quad\s*\\cdot\s*\\?\)/g, id: "latex_quad_cdot_blank" },
    { re: /'\s*\(\s*24\s*\)/g, id: "title_noise_quote" },
  ];

  for (const { re, id } of patterns) {
    if (edits.length >= MAX_EDITS_PER_PHASE) break;
    for (const m of before.matchAll(re)) {
      const frag = m[0]!;
      if (!after.includes(frag)) {
        const idx = before.indexOf(frag);
        const ctxBefore = before.slice(Math.max(0, idx - 20), idx + frag.length + 20);
        const ctxAfter = after.slice(
          Math.max(0, idx - 20),
          Math.min(after.length, idx + frag.length + 40),
        );
        const e = sampleEdit(phase, ctxBefore, ctxAfter, `${ruleId}:${id}`, confidence);
        if (e && !edits.some((x) => x.rule_id === e.rule_id && x.before === e.before)) {
          edits.push(e);
        }
      }
    }
  }

  return edits.slice(0, MAX_EDITS_PER_PHASE);
}

function phaseTraceShell(
  phase: CanonicalizationPhaseIdV1,
  inputLen: number,
  outputLen: number,
  changed: boolean,
  edits: CanonicalizationEditV1[],
): CanonicalizationPhaseTraceV1 {
  const meta = CANONICALIZATION_PHASE_META[phase];
  return {
    phase,
    epistemic_class: meta.epistemic_class,
    deterministic: meta.deterministic,
    provenance: meta.provenance,
    input_len: inputLen,
    output_len: outputLen,
    changed,
    edits,
  };
}

function runPhase(
  phase: CanonicalizationPhaseIdV1,
  input: string,
  transform: (s: string) => string,
  ruleId: string,
): { text: string; trace: CanonicalizationPhaseTraceV1 } {
  const output = transform(input);
  return {
    text: output,
    trace: phaseTraceShell(
      phase,
      input.length,
      output.length,
      output !== input,
      collectSubstringEdits(phase, input, output, ruleId),
    ),
  };
}

export type EducationalTextCanonicalizationResultV1 = {
  text: string;
  trace: EducationalTextCanonicalizationTraceV1;
};

/**
 * Deterministic compiler: raw OCR transport syntax → canonical educational text.
 * 不调用模型；AI structuring 须在此之后。
 */
export function runEducationalTextCanonicalization(
  raw: string,
): EducationalTextCanonicalizationResultV1 {
  const ocrRaw = String(raw ?? "").replace(/\r\n/g, "\n");
  const phases: CanonicalizationPhaseTraceV1[] = [];

  phases.push(phaseTraceShell("ocr_raw", ocrRaw.length, ocrRaw.length, false, []));

  let s = ocrRaw;

  const glyph = runPhase(
    "transport_glyph_repair",
    s,
    (t) => {
      let x = normalizeOcrFillBlankMarkers(t);
      x = stripGotOcrTitleNoise(x);
      x = normalizeGotOcrLatexBlankMarkers(x);
      return x;
    },
    "transport_glyph_repair",
  );
  s = glyph.text;
  phases.push(glyph.trace);

  const diagram = runPhase("diagram_hallucination_strip", s, stripGotOcrDiagramLabelRunaway, "diagram_hallucination_strip");
  s = diagram.text;
  phases.push(diagram.trace);

  const coordinate = stemLooksLikeCoordinatePlaneExam(s);

  if (coordinate) {
    const geo = runPhase(
      "geometry_notation_normalize",
      s,
      (t) => normalizeCoordinatePlaneOcrText(t),
      "geometry_notation_normalize",
    );
    s = geo.text;
    phases.push(geo.trace);
  }

  const rejoin = runPhase(
    "geometry_semantic_rejoin",
    s,
    runGeometrySemanticRejoin,
    "geometry_semantic_rejoin",
  );
  s = rejoin.text;
  phases.push(rejoin.trace);

  const enumeration = runPhase(
    "enumeration_semantic_reconstruction",
    s,
    runEnumerationSemanticReconstruction,
    "enumeration_semantic_reconstruction",
  );
  s = enumeration.text;
  phases.push(enumeration.trace);

  if (coordinate) {
    const math = runPhase(
      "math_exam_lowering",
      s,
      (t) =>
        normalizeMathExamOcrText(t, {
          skipCoordinatePlane: true,
          skipFillBlank: true,
          skipDiagramStrip: true,
        }),
      "math_exam_lowering",
    );
    s = math.text;
    phases.push(math.trace);
  }

  const canonical = s.trim();
  phases.push(
    phaseTraceShell("canonical_text", s.length, canonical.length, canonical !== s, []),
  );

  return {
    text: canonical,
    trace: {
      version: 1,
      authority: EDUCATIONAL_CANONICALIZATION_AUTHORITY,
      coordinate_plane_detected: coordinate,
      phases,
      canonical_text_len: canonical.length,
    },
  };
}

/** @deprecated 使用 {@link runEducationalTextCanonicalization} 获取 trace */
export function canonicalizeEducationalText(raw: string): string {
  return runEducationalTextCanonicalization(raw).text;
}

/** 冻结导出 canonical educational text（供 parser / bench / 手改对照） */
export function downloadCanonicalEducationalText(
  text: string,
  filename = "canonical-educational-text.txt",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
