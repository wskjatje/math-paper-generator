/**
 * 题干「标签段」：行本身仅为 Markdown 粗体标签（如 **输入格式**：）时，
 * 其后正文缩进展示，与设问导语区分。模式来自 paperSurfaceLayout，禁止按学科/文案硬编码。
 */
import {
  PAPER_SURFACE_LAYOUT,
  type PaperSurfaceLayoutConfig,
} from "@/config/examDomain";

export type StemLabeledSection = {
  /** null = 导语/未标注正文 */
  label: string | null;
  body: string;
};

function compileLabelLinePattern(cfg: PaperSurfaceLayoutConfig): RegExp {
  try {
    return new RegExp(cfg.stemLabeledSectionLabelLinePattern, "u");
  } catch {
    return /^\*\*[^*\n]+\*\*\s*[:：]?\s*$/u;
  }
}

function compilePlainLabelLinePattern(cfg: PaperSurfaceLayoutConfig): RegExp | null {
  const src = cfg.stemLabeledSectionPlainLabelLinePattern?.trim();
  if (!src) return null;
  try {
    return new RegExp(src, "u");
  } catch {
    return null;
  }
}

export function isStemLabeledSectionLabelLine(
  line: string,
  cfg: PaperSurfaceLayoutConfig = PAPER_SURFACE_LAYOUT,
): boolean {
  if (!cfg.stemLabeledSectionsEnabled) return false;
  const t = String(line ?? "").trim();
  if (!t) return false;
  if (compileLabelLinePattern(cfg).test(t)) return true;
  const plain = compilePlainLabelLinePattern(cfg);
  if (!plain) return false;
  // 冒号前含句读/顿号 → 叙述句，非标签
  if (/[。！？!?，、；;]/.test(t.replace(/[:：]\s*$/, ""))) return false;
  if (/^[（(]\s*\d/.test(t)) return false;
  return plain.test(t);
}

/** 题干是否含标签段（有则勿走 EPL inline 拆段，否则缩进层级丢失） */
export function stemHasLabeledSections(
  raw: string,
  cfg: PaperSurfaceLayoutConfig = PAPER_SURFACE_LAYOUT,
): boolean {
  if (!cfg.stemLabeledSectionsEnabled) return false;
  let inFence = false;
  for (const line of String(raw ?? "").replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && isStemLabeledSectionLabelLine(line, cfg)) return true;
  }
  return false;
}

/**
 * 按标签行切段；围栏内不识别标签。无标签时返回单一导语段。
 */
export function splitStemLabeledSections(
  raw: string,
  cfg: PaperSurfaceLayoutConfig = PAPER_SURFACE_LAYOUT,
): StemLabeledSection[] {
  const text = String(raw ?? "");
  if (!cfg.stemLabeledSectionsEnabled || !text.trim()) {
    return [{ label: null, body: text }];
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: StemLabeledSection[] = [];
  let curLabel: string | null = null;
  let buf: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = buf.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    if (curLabel == null && !body.trim()) {
      buf = [];
      return;
    }
    sections.push({ label: curLabel, body });
    buf = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && isStemLabeledSectionLabelLine(line, cfg)) {
      flush();
      curLabel = line.trim();
      continue;
    }
    buf.push(line);
  }
  flush();

  if (!sections.some((s) => s.label != null)) {
    return [{ label: null, body: text }];
  }
  return sections;
}
