/**
 * 兼容旧导入：演示卷定义已迁至 {@link projectExamStore.server.ts}
 */
import { loadProjectBundledExamDetail, STATIC_DEMO_EXAM_ID } from "@/lib/projectExamStore.server";

export { STATIC_DEMO_EXAM_ID };

export function loadLocalDemoExamDetail() {
  const d = loadProjectBundledExamDetail(STATIC_DEMO_EXAM_ID);
  if (!d) {
    throw new Error(`演示卷资源缺失：public/demo/exam-paper.json`);
  }
  return d;
}
