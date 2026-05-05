import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

function parseAnswerTokens(answer) {
  const raw = ensureText(answer).trim();
  if (!raw) return [];
  const set = new Set();
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
    if (!/^\d+$/.test(p)) {
      set.add(p);
    }
  }
  return [...set];
}

function buildTrackScript(q, idx) {
  const options = Array.isArray(q?.options) ? q.options.map(ensureText).filter(Boolean) : [];
  const answers = parseAnswerTokens(q?.answer);
  const intro = `Track ${idx}.`;
  const stem = ensureText(q?.content).replace(/\s+/g, " ").trim() || "Listen and choose the correct answer.";

  if (answers.length > 0) {
    return `${intro} ${stem} The key words are: ${answers.join(", ")}. Repeat. ${answers.join(", ")}.`;
  }
  if (options.length > 0) {
    return `${intro} ${stem} Options are: ${options.join(", ")}.`;
  }
  return `${intro} ${stem}`;
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

  const absExamPath = path.resolve(process.cwd(), examPath);
  const raw = await readFile(absExamPath, "utf8");
  const parsed = JSON.parse(raw);
  const exam = parsed?.exam ?? {};
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const listening = questions.filter(isListeningQuestion);

  if (listening.length === 0) {
    throw new Error("未找到听力题（请确认题目含“听力/听录音/listening”等关键词）");
  }

  const examId = ensureText(exam.id) || path.basename(absExamPath, ".json");
  const outDir = path.join(process.cwd(), "public", "audio", examId);
  await mkdir(outDir, { recursive: true });

  const summary = [];
  for (let i = 0; i < listening.length; i += 1) {
    const q = listening[i];
    const trackNo = String(i + 1).padStart(2, "0");
    const text = buildTrackScript(q, i + 1);
    const txtPath = path.join(outDir, `track-${trackNo}.txt`);
    const aiffPath = path.join(outDir, `track-${trackNo}.aiff`);
    const wavPath = path.join(outDir, `track-${trackNo}.wav`);

    await writeFile(txtPath, text + "\n", "utf8");
    runOrThrow("say", ["-v", "Samantha", "-o", aiffPath, text]);
    runOrThrow("afconvert", ["-f", "WAVE", "-d", "LEI16", aiffPath, wavPath]);
    summary.push(`Track ${i + 1}: ${wavPath}`);
  }

  await writeFile(path.join(outDir, "README.txt"), summary.join("\n") + "\n", "utf8");
  console.log(`已生成 ${listening.length} 条听力音频: ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
