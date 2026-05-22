/**
 * P3：无 option_diagram_links 时，用版面块几何关系把 (A)–(D) 文本邻接到示意图块。
 */
import type {
  NormalizedOcrBlock,
  OptionDiagramLink,
  StructuredExamOcrDocument,
} from "@/lib/ocr/types";

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  const [a, b, c, d] = bbox;
  const norm = [a, b, c, d].every((n) => n >= 0 && n <= 1.0001);
  if (norm) return [a + c / 2, b + d / 2];
  return [(a + c) / 2, (b + d) / 2];
}

function inferPageExtent(blocks: NormalizedOcrBlock[]): { w: number; h: number } {
  let mx = 0;
  let my = 0;
  for (const b of blocks) {
    const [x1, y1, x2, y2] = b.bbox;
    mx = Math.max(mx, x1, x2);
    my = Math.max(my, y1, y2);
  }
  return { w: Math.max(mx, 400), h: Math.max(my, 400) };
}

/** 卷面 `(12)` / `（12）` 题号锚点（垂直位置用于归属小题） */
function gatherQuestionAnchors(blocks: NormalizedOcrBlock[]): Array<{ q: number; y: number }> {
  const re = /\(\s*(\d{1,2})\s*\)|（\s*(\d{1,2})\s*）/g;
  const out: Array<{ q: number; y: number }> = [];
  for (const b of blocks) {
    if (b.role === "diagram") continue;
    const lines = b.text.split(/\r?\n/);
    const [x1, y1, x2, y2] = b.bbox;
    const h = Math.max(1, y2 - y1);
    const lh = h / Math.max(1, lines.length);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const n = Number(m[1] || m[2]);
        if (!Number.isFinite(n) || n < 1 || n > 99) continue;
        const cy = y1 + (i + 0.5) * lh;
        out.push({ q: n, y: cy });
      }
    }
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}

function inferQuestionForY(cy: number, anchors: Array<{ q: number; y: number }>): number {
  if (!anchors.length) return 1;
  const above = anchors.filter((a) => a.y <= cy + 12);
  if (!above.length) return anchors[0]!.q;
  let best = above[0]!;
  for (const a of above) {
    if (a.y > best.y) best = a;
  }
  return best.q;
}

const OPT_HEAD = /^\s*(?:[（(]\s*([A-D])\s*[）)]|([A-D])\s*[.．、])\s*/i;

function extractOptionLabelCandidates(
  block: NormalizedOcrBlock,
): Array<{ letter: "A" | "B" | "C" | "D"; cx: number; cy: number }> {
  const [x1, y1, x2, y2] = block.bbox;
  const lines = block.text.split(/\r?\n/);
  const h = Math.max(1, y2 - y1);
  const lh = h / Math.max(1, lines.length);
  const out: Array<{ letter: "A" | "B" | "C" | "D"; cx: number; cy: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const m = OPT_HEAD.exec(line) ?? /[（(]\s*([A-D])\s*[）)]/i.exec(line);
    if (!m) continue;
    const letter = (m[1] || m[2])?.toUpperCase() as "A" | "B" | "C" | "D" | undefined;
    if (!letter || !"ABCD".includes(letter)) continue;
    const cy = y1 + (i + 0.5) * lh;
    const cx = (x1 + x2) / 2;
    out.push({ letter, cx, cy });
  }
  return out;
}

/**
 * 从块几何推断选项示意图链接（不调用网关）；与网关 option_diagram_links 去重键：
 * `questionIndex-optionLetter`。
 */
export function inferOptionDiagramLinksFromBlocks(
  doc: StructuredExamOcrDocument,
): OptionDiagramLink[] {
  const blocks = doc.blocks;
  if (blocks.length === 0) return [];

  const { w, h } = inferPageExtent(blocks);
  const maxDist = Math.hypot(w, h) * 0.32;

  const anchors = gatherQuestionAnchors(blocks);
  const diagrams = blocks.filter((b) => b.role === "diagram");
  if (diagrams.length === 0) return [];

  const candidates: Array<{
    letter: "A" | "B" | "C" | "D";
    cx: number;
    cy: number;
    q: number;
  }> = [];

  for (const b of blocks) {
    if (b.role === "diagram") continue;
    for (const c of extractOptionLabelCandidates(b)) {
      candidates.push({
        ...c,
        q: inferQuestionForY(c.y, anchors),
      });
    }
  }

  const usedDiagramIds = new Set<string>();
  const out: OptionDiagramLink[] = [];

  for (const lab of candidates) {
    let best: NormalizedOcrBlock | null = null;
    let bestD = 1e12;
    for (const d of diagrams) {
      if (usedDiagramIds.has(d.id)) continue;
      const dq = inferQuestionForY(bboxCenter(d.bbox)[1], anchors);
      if (dq !== lab.q) continue;
      const [dx, dy] = bboxCenter(d.bbox);
      const dist = Math.hypot(dx - lab.cx, dy - lab.cy);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (best && bestD <= maxDist) {
      usedDiagramIds.add(best.id);
      out.push({
        questionIndex: lab.q,
        optionLetter: lab.letter,
        diagramId: best.id,
        bbox: best.bbox,
        source: "geometry",
      });
    }
  }

  return out;
}

export function mergeInferredOptionDiagramLinks(
  doc: StructuredExamOcrDocument,
): StructuredExamOcrDocument {
  const inferred = inferOptionDiagramLinksFromBlocks(doc);
  if (!inferred.length) return doc;

  const existingSlot = new Set(
    (doc.optionDiagramLinks ?? []).map((l) => `${l.questionIndex}-${l.optionLetter}`),
  );
  const merged = [...(doc.optionDiagramLinks ?? [])];
  for (const L of inferred) {
    const k = `${L.questionIndex}-${L.optionLetter}`;
    if (existingSlot.has(k)) continue;
    existingSlot.add(k);
    merged.push(L);
  }
  return { ...doc, optionDiagramLinks: merged };
}
