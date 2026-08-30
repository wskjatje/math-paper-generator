/**
 * 讲解字幕：仅使用讲义 IR 的 narration 原文，禁止模型另写。
 */

export type ExplainSubtitleCue = {
  startSec: number;
  endSec: number;
  text: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** SRT 时间码 HH:MM:SS,mmm */
export function formatSrtTimestamp(totalSec: number): string {
  const msTotal = Math.max(0, Math.round(totalSec * 1000));
  const h = Math.floor(msTotal / 3_600_000);
  const m = Math.floor((msTotal % 3_600_000) / 60_000);
  const s = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

/**
 * 按配置折行；不改写措辞，只做硬折行。
 */
export function wrapSubtitleText(
  text: string,
  maxCharsPerCue: number,
  maxLinesPerCue: number,
): string {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const maxChars = Math.max(1, Math.floor(maxCharsPerCue));
  const maxLines = Math.max(1, Math.floor(maxLinesPerCue));
  const lines: string[] = [];
  for (const para of raw.split("\n")) {
    let rest = para.trim();
    if (!rest) continue;
    while (rest.length > 0 && lines.length < maxLines) {
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    if (lines.length >= maxLines) break;
  }
  return lines.join("\n");
}

export function buildExplainSrt(cues: readonly ExplainSubtitleCue[]): string {
  const blocks: string[] = [];
  let idx = 1;
  for (const cue of cues) {
    const body = cue.text.trim();
    if (!body) continue;
    const start = Math.max(0, cue.startSec);
    const end = Math.max(start + 0.05, cue.endSec);
    blocks.push(
      `${idx}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${body}\n`,
    );
    idx += 1;
  }
  return blocks.join("\n");
}

export function buildExplainSubtitleCuesFromNarrations(
  segments: readonly { narration: string; durationSec: number }[],
  opts: { maxCharsPerCue: number; maxLinesPerCue: number },
): ExplainSubtitleCue[] {
  const cues: ExplainSubtitleCue[] = [];
  let t = 0;
  for (const seg of segments) {
    const dur = Math.max(0.05, Number(seg.durationSec) || 0.05);
    const text = wrapSubtitleText(
      seg.narration,
      opts.maxCharsPerCue,
      opts.maxLinesPerCue,
    );
    if (text) {
      cues.push({ startSec: t, endSec: t + dur, text });
    }
    t += dur;
  }
  return cues;
}
