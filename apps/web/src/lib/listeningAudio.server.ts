import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
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
  assembleListeningInnerBody,
  buildExamListeningSpeechParts,
  extractTrailingMcOptions,
  splitListeningInnerBody,
} from "@/lib/listeningPassage.shared";
import {
  buildPassageSpeechWithProsody,
  buildSayProsodyPlan,
  LISTENING_CUE_GAP,
  renderSayScriptWithVoices,
  type SayProsodySegment,
} from "@/lib/listeningProsody.shared";
import {
  fetchLocalCloneSpeechAudio,
  loadListeningTtsProfile,
  localCloneProsodyFromProfile,
  type LocalCloneProsody,
} from "@/lib/listeningLocalCloneTts.server";
import {
  resolveListeningGradeBand,
  type ListeningTtsProfile,
} from "@/lib/listeningTtsProfile.shared";
import { stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import { listeningExamplesInOrder, questionLooksLikeListening } from "@/lib/listeningAudio.shared";
import {
  runtimePublicDirs,
  runtimePublicFileExists,
  runtimePublicPrimaryDir,
  syncRuntimePublicSubtree,
} from "@/lib/runtimePublicAssets.server";
import { isSafeLocalExamId } from "@/lib/localExamStore.server";

function listeningAudioPrimaryDir(examId: string, examples = false): string {
  const base = path.join(runtimePublicPrimaryDir("audio"), examId);
  return examples ? path.join(base, "examples") : base;
}

/** 听力合成唯一引擎：本机声纹克隆（无 Piper / say / 云端回退） */
export type ListeningSynthEngine = "local_clone";

/**
 * 单路径：data/listening-tts/profile.json（须 calibrated=true）+ 本机 OpenAI 兼容克隆 TTS。
 * 见 docs/listening-local-clone-tts.md
 */
function listeningSpeakRoleLabels(): boolean {
  return process.env.MPG_LISTENING_SPEAK_ROLE_LABELS?.trim() === "1";
}

function listeningPlayCount(): number {
  const raw = process.env.MPG_LISTENING_PLAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function subjectTextsForGradeMatch(
  exam: Pick<Exam, "subjects">,
  questions: Question[],
): string[] {
  const out: string[] = [];
  if (Array.isArray(exam.subjects)) {
    for (const s of exam.subjects) {
      if (typeof s === "string" && s.trim()) out.push(s.trim());
    }
  }
  for (const q of questions) {
    const sub = ensureText(q.subject).trim();
    if (sub) out.push(sub);
  }
  return out;
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
  return extractTrailingMcOptions(normalized);
}

function buildPaperListeningBody(q: Question): string {
  const parts = buildExamListeningSpeechParts({
    content: ensureText(q.content),
    steps: q.solution_steps,
    options: q.options,
    answer: q.answer,
    questionType: q.type,
  });
  const passageSpoken = buildPassageSpeechWithProsody(parts.passage);
  return assembleListeningInnerBody(passageSpoken, parts.after);
}

function cloneProsodyOpts(prosody: LocalCloneProsody) {
  return {
    speakRoleLabels: listeningSpeakRoleLabels(),
    defaultVoice: prosody.narratorVoice,
    dialogueVoices: prosody.dialogueVoices,
    cueGapSec: prosody.cueGapSec,
    turnGapSec: prosody.turnGapSec,
  };
}

export function resolveListeningSynthEngine(): ListeningSynthEngine {
  return "local_clone";
}

function finalizeTrackScriptForEngine(
  scriptRaw: string,
  prosody: LocalCloneProsody,
  profile: ListeningTtsProfile,
): string {
  if (!scriptRaw) return scriptRaw;
  const body = renderSayScriptWithVoices(scriptRaw, cloneProsodyOpts(prosody));
  return (
    `[mpg-listening-tts local_clone model=${profile.endpoint.model} band=${prosody.band.id} speed=${prosody.speed}]\n` +
    body
  );
}

function silencePcm(frameCount: number, channels: number, sampleWidth: number): Buffer {
  const n = Math.max(0, Math.floor(frameCount)) * channels * sampleWidth;
  return Buffer.alloc(n, 0);
}

async function readWavPcm(wavPath: string): Promise<{
  channels: number;
  sampleRate: number;
  sampleWidth: number;
  pcm: Buffer;
}> {
  const buf = await readFile(wavPath);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error(`无效 WAV：${wavPath}`);
  }
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const sampleWidth = buf.readUInt16LE(34) / 8;
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error(`WAV 缺少 data 块：${wavPath}`);
  return {
    channels,
    sampleRate,
    sampleWidth,
    pcm: buf.subarray(dataOffset, dataOffset + dataSize),
  };
}

async function writeWavPcm(
  wavPath: string,
  meta: { channels: number; sampleRate: number; sampleWidth: number },
  pcm: Buffer,
): Promise<void> {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(meta.channels, 22);
  header.writeUInt32LE(meta.sampleRate, 24);
  header.writeUInt32LE(meta.sampleRate * meta.channels * meta.sampleWidth, 28);
  header.writeUInt16LE(meta.channels * meta.sampleWidth, 32);
  header.writeUInt16LE(meta.sampleWidth * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  await writeFile(wavPath, Buffer.concat([header, pcm]));
}

function ffmpegBin(): string {
  const b = process.env.MPG_FFMPEG_BIN?.trim();
  return b && b.length > 0 ? b : "ffmpeg";
}

async function transcodeToPcmWav(inputPath: string, wavPath: string): Promise<void> {
  // ffmpeg 禁止输入输出同一路径（同为 .wav 时易踩坑）
  const outPath =
    path.resolve(inputPath) === path.resolve(wavPath)
      ? `${wavPath}.tmp.${process.pid}.wav`
      : wavPath;
  try {
    await execFile(
      ffmpegBin(),
      ["-y", "-i", inputPath, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", outPath],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    if (outPath !== wavPath) {
      await rename(outPath, wavPath);
    }
  } catch (e: unknown) {
    if (outPath !== wavPath) await unlink(outPath).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`ffmpeg 转码失败（需本机可用 ffmpeg，或设 MPG_FFMPEG_BIN）：${msg}`);
  }
}

async function synthesizeLocalCloneFromPlan(
  plan: SayProsodySegment[],
  profile: ListeningTtsProfile,
  prosody: LocalCloneProsody,
  wavPath: string,
  workDir: string,
  trackTag: string,
): Promise<void> {
  const parts: Buffer[] = [];
  let meta: { channels: number; sampleRate: number; sampleWidth: number } | null = null;
  let segIdx = 0;
  const ext =
    profile.endpoint.responseFormat === "mp3"
      ? "mp3"
      : profile.endpoint.responseFormat === "wav"
        ? "wav"
        : "bin";

  for (const item of plan) {
    if (item.kind === "silence") {
      if (!meta || item.sec <= 0) continue;
      parts.push(silencePcm(Math.round(item.sec * meta.sampleRate), meta.channels, meta.sampleWidth));
      continue;
    }
    const rawPath = path.join(workDir, `${trackTag}-clone-${segIdx}.raw.${ext}`);
    const segWav = path.join(workDir, `${trackTag}-clone-${segIdx}.wav`);
    segIdx += 1;
    const bytes = await fetchLocalCloneSpeechAudio({
      text: item.text,
      voice: item.voice,
      speed: prosody.speed,
      profile,
    });
    await writeFile(rawPath, bytes);
    await transcodeToPcmWav(rawPath, segWav);
    await unlink(rawPath).catch(() => {});
    const chunk = await readWavPcm(segWav);
    await unlink(segWav).catch(() => {});
    if (!meta) {
      meta = {
        channels: chunk.channels,
        sampleRate: chunk.sampleRate,
        sampleWidth: chunk.sampleWidth,
      };
    } else if (
      meta.channels !== chunk.channels ||
      meta.sampleRate !== chunk.sampleRate ||
      meta.sampleWidth !== chunk.sampleWidth
    ) {
      throw new Error("本地克隆 TTS 分段 WAV 格式不一致，无法拼接");
    }
    parts.push(chunk.pcm);
  }

  if (!meta || parts.length === 0) {
    throw new Error("本地克隆 TTS 分段合成为空");
  }
  await writeWavPcm(wavPath, meta, Buffer.concat(parts));
}

async function synthesizeTrackWav(
  scriptRaw: string,
  wavPath: string,
  profile: ListeningTtsProfile,
  prosody: LocalCloneProsody,
): Promise<void> {
  const plan = buildSayProsodyPlan(scriptRaw, cloneProsodyOpts(prosody));
  const workDir = path.dirname(wavPath);
  const trackTag = path.basename(wavPath, ".wav");
  await synthesizeLocalCloneFromPlan(plan, profile, prosody, wavPath, workDir, trackTag);
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
  const parts = buildExamListeningSpeechParts({
    content: ensureText(ex.content),
    steps: ex.solution_steps,
    options: null,
    answer: ex.answer,
  });
  const passageSpoken = buildPassageSpeechWithProsody(parts.passage);
  const after =
    parts.after.trim() ||
    plainTextForSpeech(ensureText(ex.content)) ||
    "Listen carefully to this practice example.";
  return assembleListeningInnerBody(passageSpoken, after);
}

/**
 * 仅复听「材料段」；听后问题只念一遍。旧稿无分隔符时整段只播一遍。
 */
function buildTrackScriptFromParts(
  passage: string,
  after: string,
  idx: number,
  kind: "question" | "example",
): string {
  const plays = listeningPlayCount();
  const label = kind === "example" ? `Example ${idx}.` : `Question ${idx}.`;
  const chunks: string[] = [label];

  const passageBody = passage.trim();
  if (passageBody) {
    for (let p = 0; p < plays; p += 1) {
      if (p > 0) chunks.push("Please listen again.");
      chunks.push(passageBody);
    }
  }

  if (after.trim()) chunks.push(after.trim());
  return chunks.join(` ${LISTENING_CUE_GAP} `);
}

function buildExampleTrackScriptFromInnerBody(innerBody: string, idx: number): string {
  const { passage, after } = splitListeningInnerBody(innerBody);
  return buildTrackScriptFromParts(passage, after, idx, "example");
}

function buildTrackScriptFromInnerBody(innerBody: string, idx: number): string {
  const { passage, after } = splitListeningInnerBody(innerBody);
  return buildTrackScriptFromParts(passage, after, idx, "question");
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
  const parts = buildExamListeningSpeechParts({
    content: ensureText(ex.content) || ensureText(parentQ.content),
    steps: ex.solution_steps,
    options: parentQ.options ?? null,
    answer: ex.answer,
    questionType: parentQ.type,
  });
  const passageSpoken = buildPassageSpeechWithProsody(parts.passage);
  let after = parts.after.trim();
  if (!passageSpoken && !after) {
    const intro = typeIntroForExampleSpeech(parentQ);
    after = [intro, plainTextForSpeech(ensureText(ex.content)) || "Listen carefully to this practice example."]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return assembleListeningInnerBody(passageSpoken, after);
}

function buildExampleTrackScript(parentQ: Question, ex: Example, idx: number): string {
  return buildExampleTrackScriptFromInnerBody(buildExampleSpeechBody(parentQ, ex), idx);
}

/**
 * 试卷逻辑删除时移除听力产物：`public/audio/<examId>/`（含 `listening-script.md`、`track-*`、以及同型例题目录 `examples/`）。
 * 同步清理所有运行时候选目录。失败仅记日志，不抛出，以免阻断题库删除。
 */
export async function removePublicListeningArtifactsForExam(examId: string): Promise<void> {
  if (!isSafeLocalExamId(examId)) return;
  for (const base of runtimePublicDirs("audio")) {
    const dir = path.join(base, examId);
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[listening audio] remove audio/${examId} failed (${base}):`, msg);
    }
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

  const outputDir = listeningAudioPrimaryDir(examId);
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
  await syncRuntimePublicSubtree("audio", examId);
  return { wrote: true, outputPath: mdPath };
}

export async function maybeGenerateListeningAudioForExam(
  examId: string,
  questions: Question[],
  exam: Pick<Exam, "title" | "subjects">,
): Promise<{
  generated: number;
  outputDir?: string;
  skippedReason?: string;
  engine?: ListeningSynthEngine;
}> {
  const listening = questions.filter(questionLooksLikeListening);
  if (listening.length === 0) return { generated: 0, skippedReason: "无听力题" };

  const profile = await loadListeningTtsProfile();
  const band = resolveListeningGradeBand(profile, subjectTextsForGradeMatch(exam, questions));
  const prosody = localCloneProsodyFromProfile(profile, band);
  const engine = resolveListeningSynthEngine();

  const outputDir = listeningAudioPrimaryDir(examId);
  await mkdir(outputDir, { recursive: true });

  const hasEngListening = examHasEnglishListening(questions, exam);
  const mdPath = path.join(outputDir, LISTENING_SCRIPT_MD_FILENAME);
  let mdBodies = new Map<number, string>();

  if (hasEngListening) {
    // 每次生成都从题库重建朗读层（对齐考场结构）；题面区仍与题库核对。
    // 若需细调停顿，可改完 listening-script.md 后设 MPG_LISTENING_KEEP_MD=1 再生成。
    const keepMd = process.env.MPG_LISTENING_KEEP_MD?.trim() === "1";
    let mdSource = "";
    if (keepMd) {
      try {
        mdSource = await readFile(mdPath, "utf8");
      } catch {
        mdSource = "";
      }
    }
    mdBodies = parseListeningScriptMarkdown(mdSource);
    const missingTrack = listening.some(
      (_, i) => !mdBodies.get(i + 1) || !String(mdBodies.get(i + 1)).trim(),
    );
    if (!keepMd || !mdSource.trim() || missingTrack) {
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
    const script = finalizeTrackScriptForEngine(scriptRaw, prosody, profile);
    const textPath = path.join(outputDir, `track-${trackNo}.txt`);
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);

    await writeFile(textPath, script + "\n", "utf8");
    await synthesizeTrackWav(scriptRaw, wavPath, profile, prosody);
  }

  await syncRuntimePublicSubtree("audio", examId);
  return { generated: listening.length, outputDir, engine };
}

export async function maybeGenerateListeningExampleAudioForExam(
  examId: string,
  questions: Question[],
  examples: Example[],
  examTitle: string,
  examSubjects?: Exam["subjects"],
): Promise<{
  generated: number;
  outputDir?: string;
  skippedReason?: string;
  engine?: ListeningSynthEngine;
}> {
  const ordered = listeningExamplesInOrder(questions, examples);
  if (ordered.length === 0) return { generated: 0, skippedReason: "无听力类题目下的同型例题" };

  const profile = await loadListeningTtsProfile();
  const band = resolveListeningGradeBand(
    profile,
    subjectTextsForGradeMatch({ subjects: examSubjects ?? [] }, questions),
  );
  const prosody = localCloneProsodyFromProfile(profile, band);
  const engine = resolveListeningSynthEngine();

  const outputDir = listeningAudioPrimaryDir(examId, true);
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
    const script = finalizeTrackScriptForEngine(scriptRaw, prosody, profile);
    const textPath = path.join(outputDir, `track-${trackNo}.txt`);
    const wavPath = path.join(outputDir, `track-${trackNo}.wav`);

    await writeFile(textPath, script + "\n", "utf8");
    await synthesizeTrackWav(scriptRaw, wavPath, profile, prosody);
  }

  await syncRuntimePublicSubtree("audio", examId);
  return { generated: ordered.length, outputDir, engine };
}

export async function examListeningExampleAudioFilesReady(
  examId: string,
  questions: Question[],
  examples: Example[],
): Promise<boolean> {
  const ordered = listeningExamplesInOrder(questions, examples);
  if (ordered.length === 0) return false;

  for (let i = 0; i < ordered.length; i += 1) {
    const trackNo = String(i + 1).padStart(2, "0");
    const ok = await runtimePublicFileExists("audio", `${examId}/examples/track-${trackNo}.wav`);
    if (!ok) return false;
  }
  return true;
}

export async function examListeningAudioFilesReady(
  examId: string,
  questions: Question[],
): Promise<boolean> {
  const listening = questions.filter(questionLooksLikeListening);
  if (listening.length === 0) return false;

  for (let i = 0; i < listening.length; i += 1) {
    const trackNo = String(i + 1).padStart(2, "0");
    const ok = await runtimePublicFileExists("audio", `${examId}/track-${trackNo}.wav`);
    if (!ok) return false;
  }
  return true;
}
