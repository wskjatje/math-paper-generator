/**
 * Active Diagram Pack 注册（与 data/diagram-packs/registry.json 的 active 条目保持同步）。
 * 运行时不读磁盘 JSON（SSR/客户端一致）；单测核对与文件一致，避免漂移。
 * 禁止按题号分支；仅按 pack id / 学科族做闸门与学习 scope 校验。
 */

export type ActiveDiagramPack = {
  id: string;
  subject: string;
};

/** 须与 data/diagram-packs/registry.json 中 status=active 的 packs 一致 */
export const ACTIVE_DIAGRAM_PACKS: readonly ActiveDiagramPack[] = [
  { id: "math.geometry", subject: "数学" },
  { id: "math.function", subject: "数学" },
  { id: "physics.mechanics", subject: "物理" },
] as const;

export type DiagramSubjectFamily =
  | "math"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography"
  | "chinese"
  | "english"
  | "other"
  | "unknown";

export function diagramSubjectFamily(subject: string | undefined): DiagramSubjectFamily {
  const s = String(subject ?? "").trim();
  if (!s) return "unknown";
  if (/数学|math|几何|代数|三角/i.test(s)) return "math";
  if (/物理|physics/i.test(s)) return "physics";
  if (/化学|chem/i.test(s)) return "chemistry";
  if (/生物|bio/i.test(s)) return "biology";
  if (/地理|geo/i.test(s)) return "geography";
  if (/语文|chinese|中文/i.test(s)) return "chinese";
  if (/英语|english/i.test(s)) return "english";
  return "other";
}

export function diagramPackFamily(pack: string | undefined): DiagramSubjectFamily {
  const p = String(pack ?? "").trim();
  if (!p) return "unknown";
  if (p.startsWith("math.")) return "math";
  if (p.startsWith("physics.")) return "physics";
  if (p.startsWith("chemistry.")) return "chemistry";
  if (p.startsWith("biology.")) return "biology";
  if (p.startsWith("geography.")) return "geography";
  if (p.startsWith("chinese.")) return "chinese";
  if (p.startsWith("english.")) return "english";
  return "other";
}

/**
 * pack 与 subject 是否同族。任一侧缺失时视为「未声明」，不拦（由调用方决定是否要求齐全）。
 */
export function diagramPackMatchesSubject(
  pack: string | undefined,
  subject: string | undefined,
): boolean {
  if (!pack?.trim() || !subject?.trim()) return true;
  const pf = diagramPackFamily(pack);
  const sf = diagramSubjectFamily(subject);
  if (pf === "unknown" || sf === "unknown") return true;
  return pf === sf;
}

export function listActiveDiagramPackIds(): string[] {
  return ACTIVE_DIAGRAM_PACKS.map((p) => p.id);
}

/**
 * 该学科是否已有 active Pack（应启用「如图」硬闸）。
 * 空学科 → true（与历史「缺省按数学严格」一致，避免漏拦）。
 */
export function subjectHasActiveDiagramPack(subject: string | undefined): boolean {
  const s = String(subject ?? "").trim();
  if (!s) return true;
  const family = diagramSubjectFamily(s);
  if (family === "unknown") return true;
  if (family === "other") return false;
  return ACTIVE_DIAGRAM_PACKS.some((p) => diagramSubjectFamily(p.subject) === family);
}

/** 人类可读的 active pack 列表（错误文案用） */
export function formatActiveDiagramPackList(): string {
  return listActiveDiagramPackIds().join(" / ");
}
