/**
 * 第三级：仓库内置 MPG 试卷（随项目分发，只读）。
 * 解析顺序见 getExamDetail：云 → 本地 → 此处。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Exam, Question } from "@/lib/types";
import type { MpgExamPaper } from "@/lib/mpgAdapter";
import { mpgPaperToExamDetail } from "@/lib/mpgAdapter";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

/** 与 AGENTS.md、路由 /exam/demo 一致 */
export const STATIC_DEMO_EXAM_ID = "demo";

export const PROJECT_EXAM_REGISTRY = [
  { routeId: STATIC_DEMO_EXAM_ID, relativePath: "public/demo/exam-paper.json" },
  {
    routeId: "demo-2026-amc-style-01",
    relativePath: "papers/2026/demo-2026-amc-style-01/exam-paper.json",
  },
] as const;

export function isProjectBundledRouteId(id: string): boolean {
  return PROJECT_EXAM_REGISTRY.some((e) => e.routeId === id);
}

function questionTypesOrdered(questions: Question[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const sorted = [...questions].sort((a, b) => a.order_index - b.order_index);
  for (const q of sorted) {
    if (seen.has(q.type)) continue;
    seen.add(q.type);
    order.push(q.type);
  }
  return order;
}

/** 从磁盘加载内置 MPG，失败返回 null */
export function loadProjectBundledExamDetail(routeId: string): {
  exam: Exam;
  questions: Question[];
  examples: [];
} | null {
  const entry = PROJECT_EXAM_REGISTRY.find((e) => e.routeId === routeId);
  if (!entry) return null;
  try {
    const full = join(resolveProjectRoot(), entry.relativePath);
    const raw = readFileSync(full, "utf-8");
    const mpg = JSON.parse(raw) as MpgExamPaper;
    return mpgPaperToExamDetail(mpg, routeId);
  } catch {
    return null;
  }
}

/** 试卷库列表：内置卷摘要（体量小，启动时读若干 JSON 可接受） */
export function listProjectExamSummaries(): Exam[] {
  const out: Exam[] = [];
  for (const { routeId } of PROJECT_EXAM_REGISTRY) {
    const detail = loadProjectBundledExamDetail(routeId);
    if (!detail) continue;
    out.push({
      ...detail.exam,
      question_types: questionTypesOrdered(detail.questions),
      storage_source: "project",
    });
  }
  return out;
}
