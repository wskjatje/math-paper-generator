import { readFile, writeFile, mkdir } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const webPublicRoot = path.join(repoRoot, "apps", "web", "public");

function usage() {
  console.log("用法:");
  console.log("  node scripts/generate-listening-audio-temp.mjs --exam <exam-json-path>");
  console.log("示例:");
  console.log("  node scripts/generate-listening-audio-temp.mjs --exam data/local-exams/xxx.json");
}

function parseArgs(argv) {
  const args = { examPath: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--exam") {
      args.examPath = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return args;
}

function ensureText(v) {
  return typeof v === "string" ? v : "";
}

function isListeningQuestion(q) {
  const subject = ensureText(q?.subject);
  const typeLabel = ensureText(q?.type_label);
  const content = ensureText(q?.content);
  const tags = Array.isArray(q?.knowledge_tags) ? q.knowledge_tags.map(ensureText).join(" ") : "";
  const blob = `${subject} ${typeLabel} ${content} ${tags}`.toLowerCase();
  return (
    blob.includes("听力") ||
    blob.includes("听录音") ||
    blob.includes("listening") ||
    blob.includes("audio")
  );
}

const CHOICE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function listeningRateWpm() {
  const raw = process.env.MPG_LISTENING_RATE_WPM?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 80 && n <= 400) return n;
  }
  return 170;
}

function listeningVoice() {
  const v = process.env.MPG_LISTENING_VOICE?.trim();
  return v && v.length > 0 ? v : "Samantha";
}

function listeningPlayCount() {
  const raw = process.env.MPG_LISTENING_PLAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function listeningWordGapSec() {
  const raw = process.env.MPG_LISTENING_WORD_GAP_SEC?.trim();
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 6) return n;
  }
  return 2.3;
}

function piperModelPath() {
  const m = process.env.MPG_PIPER_MODEL?.trim();
  return m && m.length > 0 ? m : null;
}

function piperBinary() {
  const b = process.env.MPG_PIPER_BIN?.trim();
  return b && b.length > 0 ? b : "piper";
}

/** 与 listeningAudio.server.ts 一致，缓解 macOS 下缺少 libespeak-ng */
function envForPiperSpawn() {
  const env = { ...process.env };
  const parts = [];
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
  env.DYLD_LIBRARY_PATH = [...parts, prev].filter(Boolean).join(":");
  return env;
}

/** 与 listeningAudio.server.ts 一致：优先 Piper，否则 macOS say */
function synthesizeTrackWav(script, wavPath, aiffPath) {
  const model = piperModelPath();
  if (model) {
    const res = spawnSync(piperBinary(), ["--model", model, "--output_file", wavPath], {
      input: script,
      maxBuffer: 64 * 1024 * 1024,
      env: envForPiperSpawn(),
    });
    if (res.status !== 0) {
      const err = Buffer.concat([res.stdout || Buffer.from(""), res.stderr || Buffer.from("")])
        .toString("utf8")
        .trim();
      throw new Error(`piper 执行失败: ${err || `exit ${res.status ?? "?"}`}`);
    }
    return;
  }

  if (process.platform !== "darwin") {
    throw new Error("未配置 MPG_PIPER_MODEL，且非 macOS，无法使用 say。参见 docs/listening-piper-setup.md");
  }

  runOrThrow("say", [
    "-v",
    listeningVoice(),
    "-r",
    String(listeningRateWpm()),
    "-o",
    aiffPath,
    script,
  ]);
  runOrThrow("afconvert", ["-f", "WAVE", "-d", "LEI16", aiffPath, wavPath]);
  try {
    unlinkSync(aiffPath);
  } catch {
    /* ignore */
  }
}

function choiceLetterFromIndex(index) {
  if (!Number.isFinite(index) || index < 0 || index >= CHOICE_LETTERS.length) {
    return String(index + 1);
  }
  return CHOICE_LETTERS[index] ?? String(index + 1);
}

function stripLeadingChoiceMarker(raw) {
  const s = String(raw ?? "").trimStart();
  return s.replace(/^[A-Za-zＡ-Ｚ]\s*[\.．。、]\s*/u, "").trim();
}

function plainTextForSpeech(s) {
  return ensureText(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkStemIntoSentences(stem) {
  const s = String(stem ?? "").trim();
  if (!s) return [];
  const pieces = s.split(/(?<=[.。!?？])\s+/).map((x) => x.trim()).filter(Boolean);
  return pieces.length > 0 ? pieces : [s];
}

function buildStemAndOptionsSpeech(q) {
  const options = Array.isArray(q?.options) ? q.options.map(ensureText).filter(Boolean) : [];
  const rawStem = plainTextForSpeech(ensureText(q?.content));
  const stem =
    rawStem ||
    "Listen carefully. Then choose the best answer from the options you will hear next.";

  const chunks = [...chunkStemIntoSentences(stem)];

  if (options.length > 0) {
    chunks.push("Here are the choices.");
    for (let oi = 0; oi < options.length; oi += 1) {
      const letter = choiceLetterFromIndex(oi);
      const body =
        plainTextForSpeech(stripLeadingChoiceMarker(options[oi] ?? "")) || `option ${letter}`;
      chunks.push(`Option ${letter}, ${body}.`);
    }
  }

  return chunks.join(" __WORD_GAP__ ");
}

function applySpeechPauseTokens(script, usePiper) {
  if (!script) return script;
  const sec = listeningWordGapSec();
  if (sec <= 0) return script.replaceAll("__WORD_GAP__", " ");
  if (usePiper) {
    return script.replaceAll("__WORD_GAP__", ". ... ");
  }
  const ms = Math.max(0, Math.round(sec * 1000));
  return script.replaceAll("__WORD_GAP__", ` [[slnc ${ms}]] `);
}

/** 与 src/lib/listeningAudio.server.ts 一致 */
function buildTrackScript(q, idx) {
  const body = buildStemAndOptionsSpeech(q);
  const plays = listeningPlayCount();
  const chunks = [`Listening question ${idx}.`, body];

  for (let p = 1; p < plays; p += 1) {
    chunks.push("Please listen again.");
    chunks.push(body);
  }

  chunks.push(`End of question ${idx}.`);
  return chunks.join(" ");
}

function runOrThrow(command, args) {
  const res = spawnSync(command, args, { stdio: "pipe" });
  if (res.status !== 0) {
    const err = Buffer.concat([res.stdout || Buffer.from(""), res.stderr || Buffer.from("")])
      .toString("utf8")
      .trim();
    throw new Error(`${command} 执行失败: ${err || `exit ${res.status ?? "?"}`}`);
  }
}

async function main() {
  const { examPath } = parseArgs(process.argv);
  if (!examPath) {
    usage();
    process.exit(1);
  }

  const absExamPath = path.isAbsolute(examPath) ? examPath : path.resolve(repoRoot, examPath);
  const raw = await readFile(absExamPath, "utf8");
  const parsed = JSON.parse(raw);
  const exam = parsed?.exam ?? {};
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const listening = questions.filter(isListeningQuestion);

  if (listening.length === 0) {
    throw new Error("未找到听力题（请确认题目含“听力/听录音/listening”等关键词）");
  }

  if (!piperModelPath() && process.platform !== "darwin") {
    throw new Error(
      "未配置 MPG_PIPER_MODEL（Piper ONNX），且非 macOS 无法使用 say。参见 docs/listening-piper-setup.md",
    );
  }

  const examId = ensureText(exam.id) || path.basename(absExamPath, ".json");
  const outDir = path.join(webPublicRoot, "audio", examId);
  await mkdir(outDir, { recursive: true });

  const summary = [];
  const usePiper = piperModelPath() != null;
  for (let i = 0; i < listening.length; i += 1) {
    const q = listening[i];
    const trackNo = String(i + 1).padStart(2, "0");
    const textRaw = buildTrackScript(q, i + 1);
    const text = applySpeechPauseTokens(textRaw, usePiper);
    const txtPath = path.join(outDir, `track-${trackNo}.txt`);
    const aiffPath = path.join(outDir, `track-${trackNo}.aiff`);
    const wavPath = path.join(outDir, `track-${trackNo}.wav`);

    await writeFile(txtPath, text + "\n", "utf8");
    synthesizeTrackWav(text, wavPath, aiffPath);
    summary.push(`Track ${i + 1}: ${wavPath}`);
  }

  await writeFile(path.join(outDir, "README.txt"), summary.join("\n") + "\n", "utf8");
  console.log(`已生成 ${listening.length} 条听力音频: ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
