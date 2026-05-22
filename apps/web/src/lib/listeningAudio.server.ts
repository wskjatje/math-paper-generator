import { execFile as execFileCb } from "node:child_process";
import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Example, Exam, Question } from "@/lib/types";
import { examHasEnglishListening } from "@/lib/listeningExamPolicy.shared";
import {
  buildListeningScriptMarkdownDocument,
  listeningScriptSurfacesMismatchDetail,
  listeningSurfaceFromQuestion,
  LISTENING_SCRIPT_MD_FILENAME,
  normalizeListeningPlainText,
  parseListeningScriptMarkdown,
  parseListeningScriptMarkdownSurfaces,
} from "@/lib/listeningScriptMarkdown.shared";
import {
  formatSolutionStepsForListeningAudio,
  type ListeningStepsLeakContext,
} from "@/lib/listeningAudioStepsSanitize.shared";
import { choiceLetterFromIndex, stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import { listeningExamplesInOrder, questionLooksLikeListening } from "@/lib/listeningAudio.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { isSafeLocalExamId } from "@/lib/localExamStore.server";

/**
 * 本地 Piper：`MPG_PIPER_MODEL` 为 `.onnx` 绝对路径时优先使用（需本机已装 `piper`）。
 * macOS `say`：未配置 Piper 时在 macOS 上使用；可用 `MPG_LISTENING_RATE_WPM`、`MPG_LISTENING_VOICE`、`MPG_LISTENING_PLAYS`。
 */
function listeningRateWpm(): number {
  const raw = process.env.MPG_LISTENING_RATE_WPM?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 80 && n <= 400) return n;
  }
  return 170;
}

function listeningVoice(): string {
  const v = process.env.MPG_LISTENING_VOICE?.trim();
  return v && v.length > 0 ? v : "Samantha";
}

function listeningPlayCount(): number {
  const raw = process.env.MPG_LISTENING_PLAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function listeningWordGapSec(): number {
  const raw = process.env.MPG_LISTENING_WORD_GAP_SEC?.trim();
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 6) return n;
  }
  return 2.3;
}

const execFile = promisify(execFileCb);

function ensureText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function plainTextForSpeech(s: string): string {
  return normalizeListeningPlainText(s);
}

function normalizeLatinLettersForMcParse(s: string): string {
  return s.replace(/[\uff21-\uff3a]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff21 + 65));
}

function extractMcStemOptionsFromPlain(plain: string): { stem: string; options: string[] } | null {
  const normalized = normalizeLatinLettersForMcParse(plain).trim();
  if (!normalized) return null;

  const firstOpt = normalized.search(/(?:^|\s)[A-H][.．、:：]/);
  if (firstOpt < 0) return null;

  const stem = normalized.slice(0, firstOpt).trim();
  const tail = normalized.slice(firstOpt).trim();
  const segments = tail.split(/\s+(?=[A-H][.．、:：])/);
  const options: string[] = [];
  for (const seg of segments) {
    const body = seg.replace(/^[A-H][.．、:：]\s*/, "").trim();
    if (body) options.push(body);
  }

  if (options.length < 2) return null;

  return { stem: stem.trim(), options };
}

function chunkStemIntoSentences(stem: string): string[] {
  const s = stem.trim();
  if (!s) return [];
  const pieces = s
    .split(/(?<=[.。!?？])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return pieces.length > 0 ? pieces : [s];
}

function buildStemAndOptionsFromParts(stem: string, optionBodies: string[]): string {
  const baseStem =
    stem.trim() ||
    "Listen carefully. Then choose the best answer from the options you will hear next.";
  const chunks: string[] = [...chunkStemIntoSentences(baseStem)];

  if (optionBodies.length > 0) {
    chunks.push("Here are the choices.");
    for (let oi = 0; oi < optionBodies.length; oi += 1) {
      const letter = choiceLetterFromIndex(oi);
      const body =
        plainTextForSpeech(stripLeadingChoiceMarker(optionBodies[oi] ?? "")) || `option ${letter}`;
      chunks.push(`Option ${letter}, ${body}.`);
    }
  }

  return chunks.join(" __WORD_GAP__ ");
}

function buildStemAndOptionsSpeech(q: Pick<Question, "content" | "options">): string {
  const options = Array.isArray(q.options) ? q.options.map(ensureText).filter(Boolean) : [];
  const rawStem = plainTextForSpeech(ensureText(q.content));
  const stem =
    rawStem || "Listen carefully. Then choose the best answer from the options you will hear next.";
  return buildStemAndOptionsFromParts(stem, options);
}

function applySpeechPauseTokens(script: string, usePiper: boolean): string {
  if (!script) return script;
  const sec = listeningWordGapSec();
  if (sec <= 0) return script.replaceAll("__WORD_GAP__", " ");
  if (usePiper) {
    return script.replaceAll("__WORD_GAP__", ". ... ");
  }
  const ms = Math.max(0, Math.round(sec * 1000));
  return script.replaceAll("__WORD_GAP__", ` [[slnc ${ms}]] `);
}

function attachListeningPassageFromSteps(
  steps: Question["solution_steps"],
  core: string,
  bridgePhrase: string,
  leak: ListeningStepsLeakContext,
): string {
  const passage = formatSolutionStepsForListeningAudio(steps, leak);
  if (!passage.trim()) return core;
  const parts = ["Here is the listening passage.", passage];
  if (bridgePhrase.trim()) parts.push(bridgePhrase);
  parts.push(core);
  return parts.join(" __WORD_GAP__ ");
}

function buildPaperListeningBody(q: Question): string {
  const stemOpts = buildStemAndOptionsSpeech(q);
  return attachListeningPassageFromSteps(q.solution_steps, stemOpts, "", {
    answer: q.answer,
  });
}

function listeningStemAndOptionLinesForMd(q: Question): {
  stemForPaper: string;
  optionLines: string[];
} {
  return listeningSurfaceFromQuestion(q);
}

function listeningStemAndOptionLinesForExampleMd(
  ex: Example,
  parentQ?: Question,
): { stemForPaper: string; optionLines: string[] } {
  const plain = plainTextForSpeech(ensureText(ex.content));

  const parsed = extractMcStemOptionsFromPlain(plain);
  if (parsed && parsed.options.length >= 2) {
    return {
      stemForPaper: parsed.stem.trim() || plain || "（例题）",
      optionLines: parsed.options.map((o) => plainTextForSpeech(stripLeadingChoiceMarker(o))),
    };
  }

  const parentOpts =
    parentQ && Array.isArray(parentQ.options)
      ? parentQ.options
          .map((o) => plainTextForSpeech(stripLeadingChoiceMarker(ensureText(o))))
          .filter(Boolean)
      : [];

  if (parentOpts.length >= 2) {
    const stem =
      plain.trim() ||
      (parentQ ? plainTextForSpeech(ensureText(parentQ.content)) : "") ||
      "（例题题干）";
    return { stemForPaper: stem, optionLines: parentOpts };
  }

  const loose = extractMcStemOptionsFromPlain(plain);
  if (loose && loose.options.length >= 2) {
    return {
      stemForPaper: loose.stem.trim() || plain,
      optionLines: loose.options.map((o) => plainTextForSpeech(stripLeadingChoiceMarker(o))),
    };
  }

  return { stemForPaper: plain || "（例题正文为空）", optionLines: [] };
}

function buildExampleSpeechBodyFallback(ex: Example): string {
  const plain = plainTextForSpeech(ensureText(ex.content));
  const core = plain || "Listen carefully to this practice example.";
  return attachListeningPassageFromSteps(ex.solution_steps, core, "", {
    answer: ex.answer,
  });
}

function buildExampleTrackScriptFromInnerBody(innerBody: string, idx: number): string {
  const plays = listeningPlayCount();
  const chunks: string[] = [`Listening example ${idx}.`, innerBody];

  for (let p = 1; p < plays; p += 1) {
    chunks.push("Please listen again.");
    chunks.push(innerBody);
  }

  chunks.push(`End of example ${idx}.`);
  return chunks.join(" ");
}

function buildTrackScriptFromInnerBody(innerBody: string, idx: number): string {
  const plays = listeningPlayCount();
  const chunks: string[] = [`Listening question ${idx}.`, innerBody];

  for (let p = 1; p < plays; p += 1) {
    chunks.push("Please listen again.");
    chunks.push(innerBody);
  }

  chunks.push(`End of question ${idx}.`);
  return chunks.join(" ");
}

function typeIntroForExampleSpeech(q: Pick<Question, "type" | "type_label">): string {
  switch (q.type) {
    case "fill_blank":
      return "Fill in the blanks.";
    case "essay":
      return "Writing task.";
    case "proof":
      return "Proof problem.";
    case "programming":
      return "Programming task.";
    case "calculation":
    case "short_answer":
      return "Answer the following.";
    case "multiple_choice":
    case "multiple_choice_multi":
      return "";
    default: {
      const label = plainTextForSpeech(ensureText(q.type_label));
      return label ? `${label}.` : "Practice example.";
    }
  }
}

function buildExampleSpeechBody(parentQ: Question, ex: Example): string {
  const plain = plainTextForSpeech(ensureText(ex.content));
  const fallback = plain || "Listen carefully to this practice example.";

  const preferMcLayout =
    parentQ.type === "multiple_choice" ||
    parentQ.type === "multiple_choice_multi" ||
    questionLooksLikeListening(parentQ);

  let core: string;
  if (preferMcLayout) {
    const parsed = extractMcStemOptionsFromPlain(plain);
    if (parsed && parsed.options.length >= 2) {
      const stem =
        parsed.stem.trim() ||
        "Listen carefully. Then choose the best answer from the options you will hear next.";
      core = buildStemAndOptionsFromParts(stem, parsed.options);
    } else {
      const parentOpts = Array.isArray(parentQ.options)
        ? parentQ.options.map(ensureText).filter(Boolean)
        : [];
      if (parentOpts.length >= 2) {
        const stem =
          plain.trim() ||
          plainTextForSpeech(ensureText(parentQ.content)) ||
          "Listen carefully. Then choose the best answer from the options you will hear next.";
        core = buildStemAndOptionsFromParts(stem, parentOpts);
      } else {
        const intro = typeIntroForExampleSpeech(parentQ);
        const parts = [intro, fallback].filter((s) => s.length > 0);
        core = parts.join(" ").trim();
      }
    }
  } else {
    const intro = typeIntroForExampleSpeech(parentQ);
    const parts = [intro, fallback].filter((s) => s.length > 0);
    core = parts.join(" ").trim();
  }

  return attachListeningPassageFromSteps(ex.solution_steps, core, "", {
    answer: ex.answer,
  });
}

function buildExampleTrackScript(parentQ: Question, ex: Example, idx: number): string {
  return buildExampleTrackScriptFromInnerBody(buildExampleSpeechBody(parentQ, ex), idx);
}

function piperModelPath(): string | null {
  const m = process.env.MPG_PIPER_MODEL?.trim();
  return m && m.length > 0 ? m : null;
}

function piperBinary(): string {
  const b = process.env.MPG_PIPER_BIN?.trim();
  return b && b.length > 0 ? b : "piper";
}

function envForPiperExec(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const parts: string[] = [];
  const extra = process.env.MPG_PIPER_LIB_PATH?.trim();
  if (extra) {
    for (const p of extra.split(":")) {
      const s = p.trim();
      if (s) parts.push(s);
    }
  }
  const bin = piperBinary();
  if (path.isAbsolute(bin)) {
    parts.push(path.dirname(bin));
  }
  parts.push(
    "/opt/homebrew/opt/espeak-ng/lib",
    "/opt/homebrew/lib",
    "/usr/local/opt/espeak-ng/lib",
    "/usr/local/lib",
  );
  const prev = process.env.DYLD_LIBRARY_PATH?.trim();
  const merged = [...parts, prev].filter(Boolean).join(":");
  env.DYLD_LIBRARY_PATH = merged;
  return env;
}

async function synthesizeTrackWav(
  script: string,
  wavPath: string,
  tempAiffPath: string,
): Promise<void> {
  const model = piperModelPath();
  if (model) {
    try {
      await access(model);
    } catch {
      throw new Error(`未找到 Piper 模型文件，请检查 MPG_PIPER_MODEL：${model}`);
    }
    await execFile(piperBinary(), ["--model", model, "--output_file", wavPath], {
      input: script,
      maxBuffer: 64 * 1024 * 1024,
      env: envForPiperExec(),
    });
    return;
  }

  if (process.platform !== "darwin") {
    throw new Error(
      "未配置 MPG_PIPER_MODEL。非 macOS 环境请安装 Piper 并设置模型路径；或在 macOS 上使用内置 say。详见 docs/listening-piper-setup.md",
    );
  }

  await execFile("say", [
    "-v",
    listeningVoice(),
    "-r",
    String(listeningRateWpm()),
    "-o",
    tempAiffPath,
    script,
  ]);
  await execFile("afconvert", ["-f", "WAVE", "-d", "LEI16", tempAiffPath, wavPath]);
  await unlink(tempAiffPath).catch(() => {});
}

/**
 * 试卷逻辑删除时移除听力产物：`public/audio/<examId>/`（含 `listening-script.md`、`track-*`、以及同型例题目录 `examples/`）。
 * 失败仅记日志，不抛出，以免阻断题库删除。
 */
export async function removePublicListeningArtifactsForExam(examId: string): Promise<void> {
  if (!isSafeLocalExamId(examId)) return;
  const dir = path.join(resolveProjectRoot(), "public", "audio", examId);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[listening audio] remove public/audio/${examId} failed:`, msg);
  }
}

/**
 * 英语听力卷：将 `listening-script.md` 写入 `public/audio/<examId>/`，题面题干/选项与题库同源。
 */
export async function writeListeningScriptMarkdownForEnglishListeningExam(
  examId: string,
  exam: Pick<Exam, "title" | "subjects">,
  questions: Question[],
): Promise<{ wrote: boolean; outputPath?: string }> {
  if (!examHasEnglishListening(questions, exam)) {
    return { wrote: false };
  }

  const listening = questions.filter(questionLooksLikeListening);
  if (listening.length === 0) {
    return { wrote: false };
  }

  const root = resolveProjectRoot();
  const outputDir = path.join(root, "public", "audio", examId);
  await mkdir(outputDir, { recursive: true });

  const chunks = listening.map((q, i) => {
    const { stemForPaper, optionLines } = listeningSurfaceFromQuestion(q);
    return {
      trackIndex: i + 1,
      innerBody: buildPaperListeningBody(q),
      stemForPaper,
      optionLines,
    };
  });

  const mdPath = path.join(outputDir, LISTENING_SCRIPT_MD_FILENAME);
  await writeFile(mdPath, buildListeningScriptMarkdownDocument(exam.title ?? "", chunks), "utf8");
  return { wrote: true, outputPath: mdPath };
}

export async function maybeGenerateListeningAudioForExam(
  examId: string,
  questions: Question[],
  exam: Pick<Exam, "title" | "subjects">,
): Promise<{ generated: number; outputDir?: string; skippedReason?: string }> {
  const listening = questions.filter(questionLooksLikeListening);
  if (listening.length === 0) return { generated: 0, skippedReason: "无听力题" };

  const usePiper = piperModelPath() !== null;
  if (!usePiper && process.platform !== "darwin") {
    return {
      generated: 0,
      skippedReason:
        "未配置 MPG_PIPER_MODEL（Piper ONNX）；或非 macOS 无法使用内置 say。参见 docs/listening-piper-setup.md",
    };
  }

  const root = resolveProjectRoot();
  const outputDir = path.join(root, "public", "audio", examId);
  await mkdir(outputDir, { recursive: true });

  const hasEngListening = examHasEnglishListening(questions, exam);
  const mdPath = path.join(outputDir, LISTENING_SCRIPT_MD_FILENAME);
  let mdBodies = new Map<number, string>();

  if (hasEngListening) {
    let mdSource = "";
    try {
      mdSource = await readFile(mdPath, "utf8");
    } catch {
      mdSource = "";
    }
    mdBodies = parseListeningScriptMarkdown(mdSource);
    const missingTrack = listening.some(
      (_, i) => !mdBodies.get(i + 1) || !String(mdBodies.get(i + 1)).trim(),
    );
    if (!mdSource.trim() || missingTrack) {
      const chunks = listening.map((q, i) => {
        const { stemForPaper, optionLines } = listeningStemAndOptionLinesForMd(q);
        return {
          trackIndex: i + 1,
          innerBody: buildPaperListeningBody(q),
          stemForPaper,
          optionLines,
        };
      });
      await writeFile(
        mdPath,
        buildListeningScriptMarkdownDocument(exam.title ?? "", chunks),
        "utf8",
      );
      mdSource = await readFile(mdPath, "utf8");
      mdBodies = parseListeningScriptMarkdown(mdSource);
    }

    const surfaces = parseListeningScriptMarkdownSurfaces(mdSource);
    const mismatch = listeningScriptSurfacesMismatchDetail(listening, surfaces);
    if (mismatch) {
      throw new Error(`听力稿题面与题库选项不一致，合成已中止：${mismatch}`);
    }
  }

  for (let i = 0; i < listening.length; i += 1) {
    const q = listening[i];
    const trackNo = String(i + 1).padStart(2, "0");
    let inner = buildPaperListeningBody(q);
    if (hasEngListening) {
      const fromMd = mdBodies.get(i + 1)?.trim();
      if (fromMd) inner = fromMd;
    }
    const scriptRaw = buildTrackScriptFromInnerBody(inner, i + 1);
    const script = applySpeechPauseTokens(scriptRaw, usePiper);
    const textPath = path.join(outputDir, `track-${trackNo}.txt`);
    const aiffPath = path.join(outputDir, `track-${trackNo}.aiff`);
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);

    await writeFile(textPath, script + "\n", "utf8");
    await synthesizeTrackWav(script, wavPath, aiffPath);
  }

  return { generated: listening.length, outputDir };
}

export async function maybeGenerateListeningExampleAudioForExam(
  examId: string,
  questions: Question[],
  examples: Example[],
  examTitle: string,
): Promise<{ generated: number; outputDir?: string; skippedReason?: string }> {
  const ordered = listeningExamplesInOrder(questions, examples);
  if (ordered.length === 0) return { generated: 0, skippedReason: "无听力类题目下的同型例题" };

  const usePiper = piperModelPath() !== null;
  if (!usePiper && process.platform !== "darwin") {
    return {
      generated: 0,
      skippedReason:
        "未配置 MPG_PIPER_MODEL（Piper ONNX）；或非 macOS 无法使用内置 say。参见 docs/listening-piper-setup.md",
    };
  }

  const root = resolveProjectRoot();
  const outputDir = path.join(root, "public", "audio", examId, "examples");
  await mkdir(outputDir, { recursive: true });

  const qById = new Map(questions.map((q) => [q.id, q]));
  const mdPath = path.join(outputDir, LISTENING_SCRIPT_MD_FILENAME);

  const chunks = ordered.map((ex, i) => {
    const parentQ = ex.question_id ? qById.get(ex.question_id) : undefined;
    const innerBody =
      parentQ != null ? buildExampleSpeechBody(parentQ, ex) : buildExampleSpeechBodyFallback(ex);
    const { stemForPaper, optionLines } = listeningStemAndOptionLinesForExampleMd(ex, parentQ);
    return {
      trackIndex: i + 1,
      innerBody,
      stemForPaper,
      optionLines,
    };
  });
  await writeFile(
    mdPath,
    buildListeningScriptMarkdownDocument(examTitle ?? "", chunks, { variant: "examples" }),
    "utf8",
  );
  const mdBodies = parseListeningScriptMarkdown(await readFile(mdPath, "utf8"));

  for (let i = 0; i < ordered.length; i += 1) {
    const ex = ordered[i];
    const parentQ = ex.question_id ? qById.get(ex.question_id) : undefined;
    const trackNo = String(i + 1).padStart(2, "0");
    let inner =
      parentQ != null ? buildExampleSpeechBody(parentQ, ex) : buildExampleSpeechBodyFallback(ex);
    const fromMd = mdBodies.get(i + 1)?.trim();
    if (fromMd) inner = fromMd;

    const scriptRaw = buildExampleTrackScriptFromInnerBody(inner, i + 1);
    const script = applySpeechPauseTokens(scriptRaw, usePiper);
    const textPath = path.join(outputDir, `track-${trackNo}.txt`);
    const aiffPath = path.join(outputDir, `track-${trackNo}.aiff`);
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);

    await writeFile(textPath, script + "\n", "utf8");
    await synthesizeTrackWav(script, wavPath, aiffPath);
  }

  return { generated: ordered.length, outputDir };
}

export async function examListeningExampleAudioFilesReady(
  examId: string,
  questions: Question[],
  examples: Example[],
): Promise<boolean> {
  const ordered = listeningExamplesInOrder(questions, examples);
  if (ordered.length === 0) return false;

  const root = resolveProjectRoot();
  const outputDir = path.join(root, "public", "audio", examId, "examples");

  for (let i = 0; i < ordered.length; i += 1) {
    const trackNo = String(i + 1).padStart(2, "0");
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);
    try {
      await access(wavPath);
    } catch {
      return false;
    }
  }
  return true;
}

export async function examListeningAudioFilesReady(
  examId: string,
  questions: Question[],
): Promise<boolean> {
  const listening = questions.filter(questionLooksLikeListening);
  if (listening.length === 0) return false;

  const root = resolveProjectRoot();
  const outputDir = path.join(root, "public", "audio", examId);

  for (let i = 0; i < listening.length; i += 1) {
    const trackNo = String(i + 1).padStart(2, "0");
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);
    try {
      await access(wavPath);
    } catch {
      return false;
    }
  }
  return true;
}
