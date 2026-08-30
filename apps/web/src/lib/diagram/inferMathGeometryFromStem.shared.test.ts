import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tryInferAndRenderMathGeometry } from "./inferMathGeometryFromStem.shared";

describe("inferMathGeometryFromStem (facts only)", () => {
  it("builds scenes for all questions on sample exam", () => {
    const p = path.join(
      process.cwd(),
      "data/local-exams/6feb26c6-2813-4ebb-8b0e-d2c02b36c4db.json",
    );
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      questions: Array<{
        order_index: number;
        content: string;
        attachments?: Array<{ kind: string; alt?: string }>;
      }>;
    };
    for (const q of j.questions) {
      const fig = (q.attachments ?? []).find((a) => a.kind === "figure");
      const r = tryInferAndRenderMathGeometry(q.content, fig?.alt);
      expect(r.ok, `Q${q.order_index + 1}: ${!r.ok ? r.reason : ""}`).toBe(true);
    }
  });
});
