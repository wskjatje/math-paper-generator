/**
 * Frozen semantic lineage CI corpus — 只读 exam.snapshot.json，禁止在 gate 中重算 lineage。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";

export const SEMANTIC_LINEAGE_CI_CORPUS_REL =
  "apps/web/tests/fixtures/semantic-lineage/corpus" as const;

export const SEMANTIC_LINEAGE_CORPUS_SNAPSHOT_FILENAME = "exam.snapshot.json" as const;

function isSessionExamSnapshot(raw: unknown): raw is SessionExamSnapshot {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.exam === "object" &&
    o.exam != null &&
    Array.isArray(o.questions)
  );
}

export function sessionSnapshotToReplayInput(
  snap: SessionExamSnapshot,
  storage: "corpus" = "corpus",
): SemanticLineageReplayInput {
  return {
    examId: snap.exam.id,
    examTitle: snap.exam.title,
    storage,
    rollup: parseImportParseQualityRollup(snap.exam.import_parse_quality ?? null),
    questions: snap.questions,
  };
}

/** 列举 corpus 下含 exam.snapshot.json 的 case 目录名（排序稳定） */
export async function listSemanticLineageCorpusCaseIds(corpusDir: string): Promise<string[]> {
  const entries = await fs.readdir(corpusDir, { withFileTypes: true });
  const ids: string[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const snapPath = path.join(corpusDir, ent.name, SEMANTIC_LINEAGE_CORPUS_SNAPSHOT_FILENAME);
    try {
      await fs.access(snapPath);
      ids.push(ent.name);
    } catch {
      /* skip */
    }
  }
  return ids.sort();
}

export async function loadSemanticLineageCorpusInputs(
  corpusDir: string,
): Promise<SemanticLineageReplayInput[]> {
  const caseIds = await listSemanticLineageCorpusCaseIds(corpusDir);
  const inputs: SemanticLineageReplayInput[] = [];
  for (const caseId of caseIds) {
    const snapPath = path.join(corpusDir, caseId, SEMANTIC_LINEAGE_CORPUS_SNAPSHOT_FILENAME);
    const raw = JSON.parse(await fs.readFile(snapPath, "utf8")) as unknown;
    if (!isSessionExamSnapshot(raw)) {
      throw new Error(`corpus ${caseId}: invalid ${SEMANTIC_LINEAGE_CORPUS_SNAPSHOT_FILENAME}`);
    }
    if (raw.exam.id !== caseId) {
      throw new Error(
        `corpus ${caseId}: exam.id=${raw.exam.id} 须与目录名一致（frozen corpus discipline）`,
      );
    }
    inputs.push(sessionSnapshotToReplayInput(raw));
  }
  return inputs;
}
