/**
 * 英语听力稿 Markdown：
 * - 试卷：`public/audio/<examId>/listening-script.md`
 * - 同型例题：`public/audio/<examId>/examples/listening-script.md`
 *
 * **全项目统一约定（v3，自动与人工稿均须遵守）**
 * - 每轨：`## Track NN` 下，**第一个 `---` 之上** = 朗读内层（`parseListeningScriptMarkdown` 仅取此段送 TTS）；**第一个 `---` 之下** = 题面核对（**题目** / **选项**），**不参与合成**。
 * - 朗读内层：题干按句切分后、**Here are the choices.**、各 **Option …** 之间一律用 ` __WORD_GAP__ ` 分隔；含听力材料时由 `listeningAudio.server.ts` 用同类分隔拼接 passage 与题干段。
 * - 朗读内层**不出现**固定句 `Now the question and choices.`（已移除）。
 * 详细说明见 `docs/listening-piper-setup.md` 第 6 节。
 */

import { choiceLetterFromIndex, stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import type { Question } from "@/lib/types";

export const LISTENING_SCRIPT_MD_FILENAME = "listening-script.md";

/** 与听力卷面 / TTS 去标签规则一致，用于题面区与题库 options 对照 */
export function normalizeListeningPlainText(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 从题库题目得到 md「题面」区应展示的题干与选项行（与试卷选项顺序一致） */
export function listeningSurfaceFromQuestion(q: Question): {
  stemForPaper: string;
  optionLines: string[];
} {
  const stemForPaper = normalizeListeningPlainText(typeof q.content === "string" ? q.content : "");
  const rawOpts = Array.isArray(q.options) ? q.options : [];
  const optionLines = rawOpts.map((o) =>
    normalizeListeningPlainText(stripLeadingChoiceMarker(String(o))),
  );
  return { stemForPaper, optionLines };
}

export type ListeningScriptParsedSurface = {
  stem: string;
  options: string[];
};

/**
 * 从 v3 `listening-script.md` 各 Track 解析「题面」区（第一个 `---` 之下至下一个 `---` 之前）。
 * 用于校验 md 与题库选项是否一致。
 */
export function parseListeningScriptMarkdownSurfaces(
  md: string,
): Map<number, ListeningScriptParsedSurface> {
  const map = new Map<number, ListeningScriptParsedSurface>();
  const parts = md.split(/^##\s+Track\s+(\d+)\s*$/m);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const num = Number.parseInt(parts[i] ?? "", 10);
    const body = parts[i + 1] ?? "";
    const sep = body.search(/\n---\s*\n/);
    if (sep < 0 || !Number.isFinite(num) || num <= 0) continue;
    let surface = body.slice(sep).replace(/^\n---\s*\n/, "");
    surface = surface.replace(/\n---\s*$/m, "").trim();

    const stemBlock = surface.match(/\*\*题目\*\*\s*([\s\S]*?)(?=\*\*选项\*\*)/);
    const stem = stemBlock?.[1]?.trim() ?? "";

    const optBlock = surface.match(/\*\*选项\*\*\s*([\s\S]*)$/);
    const opts: string[] = [];
    const rawLines = (optBlock?.[1] ?? "").split("\n");
    for (const line of rawLines) {
      const m = line.match(/^[A-Z][.．、]\s*(.*)$/);
      if (m) opts.push(normalizeListeningPlainText(m[1] ?? ""));
    }

    map.set(num, { stem: normalizeListeningPlainText(stem), options: opts });
  }
  return map;
}

/** 比较题库听力序列与 md 题面：选项必须逐项一致；题干在题库非空时也必须一致 */
export function listeningScriptSurfacesMismatchDetail(
  listeningQuestions: Question[],
  surfaces: Map<number, ListeningScriptParsedSurface>,
): string | null {
  for (let i = 0; i < listeningQuestions.length; i += 1) {
    const q = listeningQuestions[i];
    const track = i + 1;
    const canon = listeningSurfaceFromQuestion(q);
    const parsed = surfaces.get(track);
    if (!parsed) {
      return `Track ${String(track).padStart(2, "0")}：md 中缺少题面区或未解析到该轨`;
    }

    const expOpts = canon.optionLines;
    const gotOpts = parsed.options;
    if (expOpts.length !== gotOpts.length) {
      return `Track ${String(track).padStart(2, "0")}：选项个数不一致（题库 ${expOpts.length} 条，md ${gotOpts.length} 条）`;
    }
    for (let j = 0; j < expOpts.length; j += 1) {
      if (expOpts[j] !== gotOpts[j]) {
        return `Track ${String(track).padStart(2, "0")}：选项 ${j + 1} 与题库不一致（题库与 md 朗读稿题面须同源，请重新命题生成 md 或手工改正 listening-script.md）`;
      }
    }

    if (canon.stemForPaper.length > 0 && canon.stemForPaper !== parsed.stem) {
      return `Track ${String(track).padStart(2, "0")}：题干与题库不一致`;
    }
  }
  return null;
}

export type ListeningScriptTrackChunk = {
  trackIndex: number;
  /** 与 `listeningAudio.server` 中 `buildPaperListeningBody` 输出一致的内层正文（不含 Listening question / 复读外壳） */
  innerBody: string;
  /** 题库题干纯文本（`Question.content`），写入 md 题面区供核对 */
  stemForPaper?: string;
  /** 与各选项一致的纯文本（已去掉 A/B 前缀），与题库 options 顺序一致 */
  optionLines?: string[];
};

export type ListeningScriptMarkdownVariant = "paper" | "examples";

export function buildListeningScriptMarkdownDocument(
  examTitle: string,
  tracks: ListeningScriptTrackChunk[],
  opts?: { variant?: ListeningScriptMarkdownVariant },
): string {
  const variant = opts?.variant ?? "paper";
  const lines: string[] = [];
  lines.push(
    `<!-- mpg-listening-script v3 | variant=${variant} | 格式约定见 docs/listening-piper-setup.md §6 -->`,
  );

  const h1 =
    variant === "examples"
      ? `# Listening examples · ${examTitle.trim() || "Exam"}`
      : `# Listening materials · ${examTitle.trim() || "Exam"}`;
  lines.push(`${h1}\n`);

  if (variant === "examples") {
    lines.push(
      `> 输出目录：\`public/audio/<试卷ID>/examples/\`，与同目录 \`listening-script.md\`、\`track-NN.wav\` 对应。规则见 **\`docs/listening-piper-setup.md\` 第 6 节**。\n`,
    );
    lines.push(
      `> **同型例题**：朗读内层由例题正文与推导过程生成；题面区供核对。朗读层须使用 \`__WORD_GAP__\` 分段。修改后请重新点击「生成例题音频」。\n`,
    );
  } else {
    lines.push(
      `> 用于 Piper/say 合成 \`track-NN.wav\`。每轨 **第一个 \`---\` 之上**为朗读内层（仅此段参与解析）；**之下**为题面核对（不参与合成）。完整规则见 **\`docs/listening-piper-setup.md\` 第 6 节**。\n`,
    );
    lines.push(
      `> **撰写提示**：听力材料写在题目「推导过程」；题干、选项来自题库。朗读内层须用 \`__WORD_GAP__\` 分隔题干各句、**Here are the choices.**、各 **Option**。修改后请重新生成 WAV。\n`,
    );
  }

  const sectionTitle =
    variant === "examples"
      ? `### 题面（例题正文与选项，供核对；不参与朗读合成）\n\n`
      : `### 题面（题库题干与选项，供核对；不参与朗读合成）\n\n`;

  const emptyStemHint =
    variant === "examples"
      ? `（例题正文 content 为空或无法解析为题干；可在题库补充后重新生成例题音频。）\n\n`
      : `（本题在题库中题干 content 为空；补充题干后请在试卷详情重新点击「生成听力音频」以更新本段与朗读稿。）\n\n`;

  for (const t of tracks) {
    const n = String(t.trackIndex).padStart(2, "0");
    lines.push(`\n## Track ${n}\n\n`);
    lines.push(t.innerBody.trim());
    lines.push(`\n\n---\n\n`);
    lines.push(sectionTitle);

    const stem = (t.stemForPaper ?? "").trim();
    if (stem) {
      lines.push(`**题目**\n\n${stem}\n\n`);
    } else {
      lines.push(`**题目**\n\n${emptyStemHint}`);
    }

    lines.push(`**选项**\n\n`);
    const opts = (t.optionLines ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (opts.length > 0) {
      for (let i = 0; i < opts.length; i += 1) {
        lines.push(`${choiceLetterFromIndex(i)}. ${opts[i]}\n`);
      }
    } else {
      lines.push(variant === "examples" ? `（例题未解析出选项列表）\n` : `（题库无选项）\n`);
    }

    lines.push(`\n---\n`);
  }

  return lines.join("");
}

/** 从 MD 解析各 Track 的正文；编号为 listening 序列中的 1-based 轨道号 */
export function parseListeningScriptMarkdown(md: string): Map<number, string> {
  const map = new Map<number, string>();
  const parts = md.split(/^##\s+Track\s+(\d+)\s*$/m);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const num = Number.parseInt(parts[i], 10);
    let body = parts[i + 1] ?? "";
    body = body.replace(/^[\s\n\r]+/, "");
    const fence = body.split(/^---\s*$/m);
    body = fence[0]?.trim() ?? body.trim();
    if (Number.isFinite(num) && num > 0 && body.length > 0) {
      map.set(num, body);
    }
  }
  return map;
}
