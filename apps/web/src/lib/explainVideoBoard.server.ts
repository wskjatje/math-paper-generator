/**
 * 板书画面：将 onScreen 渲染为 PNG（sharp + SVG），供 ffmpeg 成片。
 * 不依赖本机 ffmpeg 是否编译 drawtext（多数精简包无该滤镜）。
 */
import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import sharp from "sharp";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveExplainBoardFontFile(): Promise<string | null> {
  const board = EXPLAIN_VIDEO.render.board;
  if (!board) return null;
  const fromEnv = process.env[board.fontFileEnv]?.trim();
  if (fromEnv && (await fileExists(fromEnv))) return fromEnv;
  for (const c of board.fontFileCandidates ?? []) {
    const p = String(c ?? "").trim();
    if (p && (await fileExists(p))) return p;
  }
  return null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapBoardLines(text: string, maxChars: number, maxLines: number): string[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  const paragraphs = raw.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    const t = para.trim();
    if (!t) {
      if (lines.length < maxLines) lines.push("");
      continue;
    }
    let i = 0;
    while (i < t.length && lines.length < maxLines) {
      lines.push(t.slice(i, i + maxChars));
      i += maxChars;
    }
    if (lines.length >= maxLines) break;
  }
  if (raw.replace(/\s+/g, "").length > 0 && lines.every((l) => !l.trim())) {
    return [raw.slice(0, maxChars)];
  }
  return lines.slice(0, maxLines);
}

function cssColorFromConfig(raw: string, fallback: string): string {
  const t = raw.trim();
  if (!t) return fallback;
  if (/^0x[0-9a-fA-F]{6}$/.test(t)) return `#${t.slice(2)}`;
  if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return t;
  if (/^[a-zA-Z]+$/.test(t)) return t;
  return fallback;
}

export async function requireExplainBoardFontOrThrow(): Promise<string> {
  const board = EXPLAIN_VIDEO.render.board;
  if (!board?.burnOnScreenText) {
    throw new Error("board_burn_disabled");
  }
  const font = await resolveExplainBoardFontFile();
  if (!font) throw new Error(explainVideoMessage("boardFontMissing"));
  return font;
}

/**
 * 将板书文案渲染为 PNG（嵌入配置字体，避免空画面）。
 */
export async function writeExplainBoardPng(input: {
  onScreen: string;
  outPath: string;
  fontFile: string;
  width: number;
  height: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const board = EXPLAIN_VIDEO.render.board;
  if (!board?.burnOnScreenText) {
    return { ok: false, message: "board_burn_disabled" };
  }
  const lines = wrapBoardLines(
    input.onScreen,
    board.maxCharsPerLine,
    board.maxLines,
  );
  if (!lines.some((l) => l.trim())) {
    return { ok: false, message: "board_text_empty" };
  }

  const fontUrl = `file://${encodeURI(input.fontFile)}`;
  const fontCssSrc = `url('${fontUrl}')`;

  const bg = cssColorFromConfig(board.backgroundColor, "#1a1a1a");
  const fg = cssColorFromConfig(board.fontColor, "#ffffff");
  const lineHeight = board.fontSize + board.lineSpacing;
  const textNodes = lines
    .map((line, i) => {
      const y = board.marginY + board.fontSize + i * lineHeight;
      return `<text x="${board.marginX}" y="${y}" class="t">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css"><![CDATA[
      @font-face { font-family: 'ExplainBoard'; src: ${fontCssSrc}; }
      .t { fill: ${fg}; font-size: ${board.fontSize}px; font-family: 'ExplainBoard', sans-serif; }
    ]]></style>
  </defs>
  <rect width="100%" height="100%" fill="${bg}"/>
  ${textNodes}
</svg>`;

  try {
    await sharp(Buffer.from(svg)).png().toFile(input.outPath);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "board_png_failed",
    };
  }
}

/** @deprecated 文本文件路径仅兼容旧调用；成片请用 writeExplainBoardPng */
export async function writeExplainBoardTextFile(input: {
  onScreen: string;
  outPath: string;
}): Promise<{ ok: true; lineCount: number } | { ok: false; message: string }> {
  const board = EXPLAIN_VIDEO.render.board;
  if (!board?.burnOnScreenText) {
    return { ok: false, message: "board_burn_disabled" };
  }
  const lines = wrapBoardLines(
    input.onScreen,
    board.maxCharsPerLine,
    board.maxLines,
  );
  const body = lines.join("\n").trim();
  if (!body) return { ok: false, message: "board_text_empty" };
  await writeFile(input.outPath, `${body}\n`, "utf8");
  return { ok: true, lineCount: lines.length };
}
