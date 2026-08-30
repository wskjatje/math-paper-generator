import { describe, expect, it } from "vitest";
import { extractFirstJsonObject, stripJsonCodeFences } from "./jsonExtract.shared";

describe("extractFirstJsonObject", () => {
  it("parses a clean JSON object", () => {
    expect(extractFirstJsonObject('{"pack":"math.geometry","version":1}')).toEqual({
      pack: "math.geometry",
      version: 1,
    });
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n{"pack":"math.function","version":1}\n```';
    expect(extractFirstJsonObject(raw)).toEqual({
      pack: "math.function",
      version: 1,
    });
  });

  it("ignores trailing explanation text after the object", () => {
    const raw = '{"pack":"math.geometry","version":1}\n\n这是我为你生成的配图，如需调整请告诉我。';
    expect(extractFirstJsonObject(raw)).toEqual({
      pack: "math.geometry",
      version: 1,
    });
  });

  it("takes the first balanced object when several are emitted", () => {
    const raw = '{"pack":"math.function"} {"pack":"other"}';
    expect(extractFirstJsonObject(raw)).toEqual({ pack: "math.function" });
  });

  it("tolerates trailing commas", () => {
    const raw = '{"pack":"math.geometry","elements":[1,2,],}';
    expect(extractFirstJsonObject(raw)).toEqual({
      pack: "math.geometry",
      elements: [1, 2],
    });
  });

  it("does not confuse braces inside strings", () => {
    const raw = '{"label":"点 A {不是对象}","version":1}';
    expect(extractFirstJsonObject(raw)).toEqual({
      label: "点 A {不是对象}",
      version: 1,
    });
  });

  it("returns null for arrays or non-object output", () => {
    expect(extractFirstJsonObject("[1,2,3]")).toBeNull();
    expect(extractFirstJsonObject("抱歉，我无法生成配图。")).toBeNull();
    expect(extractFirstJsonObject("")).toBeNull();
  });

  it("stripJsonCodeFences removes fences without touching content", () => {
    expect(stripJsonCodeFences("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });
});
