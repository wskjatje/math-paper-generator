import { describe, expect, it } from "vitest";

import {
  buildImportLayoutAstStubV1,
  countPersistedImportFigureUrlsInText,
} from "@/lib/importPipelineGates.shared";

describe("importPipelineGates.shared", () => {
  it("counts persisted import-figures / offline-import markdown urls", () => {
    const t =
      "x ![]( /import-figures/a.png ) y ![](https://x.supabase.co/storage/v1/object/public/b/offline-import/z.png)";
    expect(countPersistedImportFigureUrlsInText(t)).toBe(2);
    expect(countPersistedImportFigureUrlsInText("no figures")).toBe(0);
  });

  it("buildImportLayoutAstStubV1 carries exam id and empty blocks", () => {
    const s = buildImportLayoutAstStubV1({
      examId: "e1",
      sourceCharLen: 100,
      importFigureUrlCount: 2,
      questionCount: 3,
    });
    expect(s.version).toBe(1);
    expect(s.track).toBe("B_stub");
    expect(s.exam_id).toBe("e1");
    expect(s.source_char_len).toBe(100);
    expect(s.import_figure_url_count).toBe(2);
    expect(s.question_count).toBe(3);
    expect(Array.isArray(s.blocks)).toBe(true);
    expect(s.blocks.length).toBe(0);
  });
});
