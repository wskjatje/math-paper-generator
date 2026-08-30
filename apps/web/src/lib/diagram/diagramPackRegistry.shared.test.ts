import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_DIAGRAM_PACKS,
  diagramPackMatchesSubject,
  listActiveDiagramPackIds,
  subjectHasActiveDiagramPack,
} from "./diagramPackRegistry.shared";

describe("diagramPackRegistry", () => {
  it("ACTIVE_DIAGRAM_PACKS 与 data/diagram-packs/registry.json 的 active 一致", () => {
    const raw = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data/diagram-packs/registry.json"),
        "utf8",
      ),
    ) as {
      packs: Array<{ id: string; subject: string; status: string }>;
    };
    const fromFile = raw.packs
      .filter((p) => p.status === "active")
      .map((p) => ({ id: p.id, subject: p.subject }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const fromCode = [...ACTIVE_DIAGRAM_PACKS]
      .map((p) => ({ id: p.id, subject: p.subject }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(fromCode).toEqual(fromFile);
  });

  it("pack↔subject 同族一致，异族拒绝", () => {
    expect(diagramPackMatchesSubject("math.function", "数学")).toBe(true);
    expect(diagramPackMatchesSubject("physics.mechanics", "物理")).toBe(true);
    expect(diagramPackMatchesSubject("math.geometry", "物理")).toBe(false);
    expect(diagramPackMatchesSubject("physics.mechanics", "数学")).toBe(false);
    expect(diagramPackMatchesSubject(undefined, "物理")).toBe(true);
    expect(diagramPackMatchesSubject("math.function", undefined)).toBe(true);
  });

  it("subjectHasActiveDiagramPack：数学/物理 true，化学 planned false", () => {
    expect(subjectHasActiveDiagramPack("数学")).toBe(true);
    expect(subjectHasActiveDiagramPack("物理")).toBe(true);
    expect(subjectHasActiveDiagramPack("化学")).toBe(false);
    expect(subjectHasActiveDiagramPack("")).toBe(true);
    expect(listActiveDiagramPackIds()).toContain("physics.mechanics");
  });
});
