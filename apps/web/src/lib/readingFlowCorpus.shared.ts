/**
 * P2.4.5 — Frozen reading-flow CI corpus（canonical → derived diagnostics；不重算 cognitive truth）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { buildEducationalRenderableDocument } from "@/lib/educationalPresentation.shared";
import type { ReadingFlowDocumentDiagnosticsV1 } from "@/lib/readingFlowAnalyzer.shared";
import { emitReadingFlowDiagnosticFacts } from "@/lib/readingFlowAnalyzer.shared";
import type { SemanticLineageFactV1 } from "@/lib/semanticLineageReplayModel.shared";

export const READING_FLOW_CI_CORPUS_REL =
  "apps/web/tests/fixtures/reading-flow/corpus" as const;

export const READING_FLOW_CORPUS_CANONICAL_FILENAME = "canonical.txt" as const;

export type ReadingFlowCorpusDocumentInputV1 = {
  caseId: string;
  canonicalText: string;
  label?: string;
};

export type ReadingFlowCorpusDocumentRecordV1 = {
  caseId: string;
  label?: string;
  diagnostics: ReadingFlowDocumentDiagnosticsV1;
  facts: SemanticLineageFactV1[];
};

/** 从 frozen canonical 派生 telemetry（derived-only；`replay_mutation=none`） */
export function deriveReadingFlowCorpusDocument(
  input: ReadingFlowCorpusDocumentInputV1,
): ReadingFlowCorpusDocumentRecordV1 {
  const doc = buildEducationalRenderableDocument({ canonicalText: input.canonicalText });
  const diagnostics = doc.reading_flow_diagnostics;
  if (diagnostics.replay_mutation !== "none") {
    throw new Error(`corpus ${input.caseId}: diagnostics must be replay_mutation=none`);
  }
  return {
    caseId: input.caseId,
    label: input.label,
    diagnostics,
    facts: emitReadingFlowDiagnosticFacts(diagnostics),
  };
}

export async function listReadingFlowCorpusCaseIds(corpusDir: string): Promise<string[]> {
  const entries = await fs.readdir(corpusDir, { withFileTypes: true });
  const ids: string[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const p = path.join(corpusDir, ent.name, READING_FLOW_CORPUS_CANONICAL_FILENAME);
    try {
      await fs.access(p);
      ids.push(ent.name);
    } catch {
      /* skip */
    }
  }
  return ids.sort();
}

export async function loadReadingFlowCorpusInputs(
  corpusDir: string,
): Promise<ReadingFlowCorpusDocumentInputV1[]> {
  const caseIds = await listReadingFlowCorpusCaseIds(corpusDir);
  const inputs: ReadingFlowCorpusDocumentInputV1[] = [];
  for (const caseId of caseIds) {
    const canonicalPath = path.join(corpusDir, caseId, READING_FLOW_CORPUS_CANONICAL_FILENAME);
    const canonicalText = (await fs.readFile(canonicalPath, "utf8")).trim();
    if (!canonicalText) {
      throw new Error(`corpus ${caseId}: empty ${READING_FLOW_CORPUS_CANONICAL_FILENAME}`);
    }
    inputs.push({ caseId, canonicalText });
  }
  return inputs;
}

export async function loadReadingFlowCorpusRecords(
  corpusDir: string,
): Promise<ReadingFlowCorpusDocumentRecordV1[]> {
  const inputs = await loadReadingFlowCorpusInputs(corpusDir);
  return inputs.map(deriveReadingFlowCorpusDocument);
}
