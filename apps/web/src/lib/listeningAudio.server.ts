import { execFile as execFileCb } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Question } from "@/lib/types";
import { questionLooksLikeListening } from "@/lib/listeningAudio.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

const execFile = promisify(execFileCb);

function ensureText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseAnswerTokens(answer: string): string[] {
  const raw = ensureText(answer).trim();
  if (!raw) return [];
  const set = new Set<string>();
  const pieces = raw
    .replace(/[()（）]/g, " ")
    .split(/[\s,，;；/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of pieces) {
    if (/^[A-Da-d]$/.test(p)) {
      set.add(p.toUpperCase());
      continue;
    }
    if (!/^\d+$/.test(p)) set.add(p);
  }
  return [...set];
}

function buildTrackScript(q: Pick<Question, "content" | "options" | "answer">, idx: number): string {
  const options = Array.isArray(q.options) ? q.options.map(ensureText).filter(Boolean) : [];
  const answers = parseAnswerTokens(q.answer);
  const intro = `Track ${idx}.`;
  const stem = ensureText(q.content).replace(/\s+/g, " ").trim() || "Listen and choose the correct answer.";
  if (answers.length > 0) {
    return `${intro} ${stem} The key words are: ${answers.join(", ")}. Repeat. ${answers.join(", ")}.`;
  }
  if (options.length > 0) {
    return `${intro} ${stem} Options are: ${options.join(", ")}.`;
  }
  return `${intro} ${stem}`;
}

export async function maybeGenerateListeningAudioForExam(
  examId: string,
  questions: Question[],
): Promise<{ generated: number; outputDir?: string; skippedReason?: string }> {
  if (process.platform !== "darwin") {
    return { generated: 0, skippedReason: "仅 macOS 支持 say/afconvert 自动生成" };
  }
  const listening = questions.filter(questionLooksLikeListening);
  if (listening.length === 0) return { generated: 0, skippedReason: "无听力题" };

  const root = resolveProjectRoot();
  const outputDir = path.join(root, "public", "audio", examId);
  await mkdir(outputDir, { recursive: true });

  for (let i = 0; i < listening.length; i += 1) {
    const q = listening[i];
    const trackNo = String(i + 1).padStart(2, "0");
    const script = buildTrackScript(q, i + 1);
    const textPath = path.join(outputDir, `track-${trackNo}.txt`);
    const aiffPath = path.join(outputDir, `track-${trackNo}.aiff`);
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);

    await writeFile(textPath, script + "\n", "utf8");
    await execFile("say", ["-v", "Samantha", "-o", aiffPath, script]);
    await execFile("afconvert", ["-f", "WAVE", "-d", "LEI16", aiffPath, wavPath]);
    await unlink(aiffPath).catch(() => {});
  }

  return { generated: listening.length, outputDir };
}
