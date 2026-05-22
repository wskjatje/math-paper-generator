/** 教育 OS 题目协议 v1 示例（内联为 TS，便于前端一键填入） */
export const QUESTION_V1_DEMO = {
  schema_version: "1.0.0" as const,
  id: "demo-os-q-001",
  subject: "math" as const,
  grade: 9,
  difficulty: 0.78,
  question_type: "geometry",
  knowledge_points: ["相似三角形"],
  stem: "如图，在△ABC中，DE∥BC，若 AD:DB=2:3，求 DE:BC。",
  graph_dsl: {
    type: "geometry" as const,
    elements: [
      { kind: "point" as const, id: "A", at: { x: 0, y: 4 }, label: "A" },
      { kind: "point" as const, id: "B", at: { x: -3, y: 0 }, label: "B" },
      { kind: "point" as const, id: "C", at: { x: 3, y: 0 }, label: "C" },
      { kind: "segment" as const, id: "AB", a: "A", b: "B" },
      { kind: "segment" as const, id: "AC", a: "A", b: "C" },
      { kind: "segment" as const, id: "BC", a: "B", b: "C" },
    ],
  },
  assets: [],
  answer: { mode: "text" as const, value: "2:5" },
  analysis: { short: "由平行线分线段成比例定理可得。" },
  metadata: { provenance: "manual" as const, locale: "zh-CN" },
};
