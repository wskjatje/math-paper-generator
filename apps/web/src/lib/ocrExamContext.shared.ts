/** OCR 规则适用的正文语境（通用启发式，非卷 ID / 题号专规） */

export function stemLooksLikeCoordinatePlaneExam(text: string): boolean {
  const t = String(text ?? "");
  if (/平面直角坐标|直角坐标系|坐标系中/i.test(t)) return true;
  const hasCoordPair =
    /\b[A-Z]\s*\(\s*-?\d/.test(t) ||
    /\b\d{1,3}\s*,\s*-?\d/.test(t) ||
    /\b[A-Z]\s*500\s*,\s*\d/.test(t);
  const hasGeomCue = /直角|等边|坐标|顶点|平移|△|三角形/.test(t);
  if (hasCoordPair && hasGeomCue) return true;
  const hasParentSub =
    /[（(]\s*\d{2,}\s*[）)]/.test(t) && /[（(]\s*[1-9]\s*[）)]/.test(t);
  if (hasParentSub && /如图[①②③④⑤]|图[①②③④⑤]/.test(t) && hasGeomCue) return true;
  return false;
}

export function stemLooksLikeConstructionGeometry(text: string): boolean {
  return /尺规|圆心|作图|画弧|垂直平分|角平分|折叠|旋转|相交于点|辅助线|延长线/.test(
    String(text ?? ""),
  );
}
