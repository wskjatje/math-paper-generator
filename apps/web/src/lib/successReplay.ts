import type { CompositionRowPayload } from "@/lib/types";

const LS_KEY = "mpg_success_replay_v1";
const MAX_ITEMS = 240;

export type SuccessReplayItem = {
  ts: string;
  grade: string;
  subject: string;
  paper_kind: string;
  difficulty: string;
  duration_min: number;
  total_score: number;
  compositionSignature: string;
};

function readAll(): SuccessReplayItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => x as Partial<SuccessReplayItem>)
      .filter(
        (x): x is SuccessReplayItem =>
          !!x &&
          typeof x.ts === "string" &&
          typeof x.grade === "string" &&
          typeof x.subject === "string" &&
          typeof x.paper_kind === "string" &&
          typeof x.difficulty === "string" &&
          typeof x.duration_min === "number" &&
          typeof x.total_score === "number" &&
          typeof x.compositionSignature === "string",
      )
      .slice(-MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeAll(items: SuccessReplayItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    /* quota */
  }
}

function compositionSignature(composition: CompositionRowPayload[]): string {
  return composition
    .filter((c) => c.count > 0)
    .map((c) => `${String(c.type)}:${c.count}`)
    .join("|")
    .slice(0, 400);
}

export function recordSuccessReplay(input: {
  grade: string;
  subject: string;
  paper_kind: string;
  difficulty: string;
  duration_min: number;
  total_score: number;
  composition: CompositionRowPayload[];
}): void {
  const item: SuccessReplayItem = {
    ts: new Date().toISOString(),
    grade: input.grade,
    subject: input.subject,
    paper_kind: input.paper_kind,
    difficulty: input.difficulty,
    duration_min: input.duration_min,
    total_score: input.total_score,
    compositionSignature: compositionSignature(input.composition),
  };
  const items = readAll();
  items.push(item);
  writeAll(items);
}

export function buildWeeklySuccessReplaySummary(): {
  weekSampleCount: number;
  topPatterns: Array<{ pattern: string; count: number }>;
  bySubject: Record<string, number>;
  byDifficulty: Record<string, number>;
} {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekItems = readAll().filter((x) => {
    const t = Date.parse(x.ts);
    return Number.isFinite(t) && now - t <= weekMs;
  });

  const patternCounts: Record<string, number> = {};
  const bySubject: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  for (const it of weekItems) {
    const k = `${it.subject}|${it.difficulty}|${it.compositionSignature}`;
    patternCounts[k] = (patternCounts[k] ?? 0) + 1;
    bySubject[it.subject] = (bySubject[it.subject] ?? 0) + 1;
    byDifficulty[it.difficulty] = (byDifficulty[it.difficulty] ?? 0) + 1;
  }
  const topPatterns = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, count }));

  return {
    weekSampleCount: weekItems.length,
    topPatterns,
    bySubject,
    byDifficulty,
  };
}
