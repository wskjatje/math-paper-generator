import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";

/**
 * 数字小问卷面展示（如 1 → （1））。
 * 样式来自 exam-domain.json → paperSurfaceLayout，禁止按题号硬编码。
 */
export function formatNumericSubquestionLabelDisplay(n: string | number): string {
  const raw = String(n ?? "").trim();
  if (!raw) return raw;
  if (PAPER_SURFACE_LAYOUT.subquestionLabelStyle === "bare") return raw;
  const tpl = PAPER_SURFACE_LAYOUT.subquestionLabelTemplate;
  if (!tpl.includes("{n}")) return `（${raw}）`;
  return tpl.replaceAll("{n}", raw);
}

/**
 * （n）是否升格为大问：仅当正文以配置前缀**顶格**开头（避免「若将其」误匹配）。
 */
export function shouldElevateNumericParenToSection(
  n: string,
  body: string,
  prefixes: readonly string[] = PAPER_SURFACE_LAYOUT.numericParenElevateToSectionBodyPrefixes,
): boolean {
  if (String(n).trim() !== "2") return false;
  const head = String(body ?? "").trimStart();
  if (!head || prefixes.length === 0) return false;
  return prefixes.some((p) => p.length > 0 && head.startsWith(p));
}
