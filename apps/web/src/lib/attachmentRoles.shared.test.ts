import { describe, expect, it } from "vitest";
import {
  mergeDerivedFigureAttachment,
  selectAttachmentsForDisplay,
  countSourceFigures,
  resolveAttachmentRole,
} from "@/lib/attachmentRoles.shared";
import type { QuestionAttachment } from "@/lib/types";

describe("attachmentRoles.shared", () => {
  it("mergeDerivedFigureAttachment 保留 source_figure", () => {
    const existing: QuestionAttachment[] = [
      {
        kind: "image",
        uri: "/imports/doc/fig1.png",
        role: "source_figure",
        asset_id: "a1",
      },
      {
        kind: "figure",
        uri: "pending://figure",
        role: "derived_diagram",
        figure_scene: { pack: "math.geometry", version: 1, elements: [] },
      },
    ];
    const next: QuestionAttachment = {
      kind: "figure",
      uri: "/figures/x.svg",
      role: "derived_diagram",
      figure_scene: { pack: "math.geometry", version: 1, elements: [{ type: "point", id: "A", x: 0, y: 0 }] },
    };
    const merged = mergeDerivedFigureAttachment(existing, next);
    expect(countSourceFigures(merged)).toBe(1);
    expect(merged.some((a) => a.uri === "/imports/doc/fig1.png")).toBe(true);
    expect(merged.filter((a) => resolveAttachmentRole(a) === "derived_diagram")).toHaveLength(1);
    expect(merged.find((a) => a.role === "derived_diagram")?.uri).toBe("/figures/x.svg");
  });

  it("selectAttachmentsForDisplay 默认优先原图", () => {
    const list: QuestionAttachment[] = [
      { kind: "image", uri: "/imports/a.png", role: "source_figure" },
      {
        kind: "figure",
        uri: "/figures/b.svg",
        role: "derived_diagram",
        figure_scene: { pack: "math.geometry", version: 1, elements: [] },
      },
    ];
    expect(selectAttachmentsForDisplay(list, "source").map((a) => a.uri)).toEqual([
      "/imports/a.png",
    ]);
    expect(selectAttachmentsForDisplay(list, "derived").map((a) => a.uri)).toEqual([
      "/figures/b.svg",
    ]);
    expect(selectAttachmentsForDisplay(list, "all")).toHaveLength(2);
  });
});
