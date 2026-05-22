import { describe, expect, it } from "vitest";

import {
  isHardGarbageGatewayPlainText,
  pickBestGatewayOcrPlainText,
  rankGatewayPlainTextCandidate,
} from "@/lib/gatewayOcrPlainTextPick.shared";

describe("gatewayOcrPlainTextPick", () => {
  it("prefers pipeline left column when raw.text has 钟面积 hallucination", () => {
    const pipeline =
      "(24)在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)。";
    const rawHallucination =
      "(24)在平面直角坐标系中，直角△AOB的顶点\n(2) 将等边△DEF沿水平方向向右平移，得到钟面积为8";
    const out = pickBestGatewayOcrPlainText({
      pipelinePlain: pipeline,
      raw: { text: rawHallucination, blocks: [] },
    });
    expect(out).toContain("A(0,5)");
    expect(out).not.toMatch(/钟面积/);
  });

  it("rejects hard garbage and prefers valid coord pairs", () => {
    const good =
      "(24)在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)。";
    const bad =
      "(24)直角△AOB的顶点40,5) 5(0,3) (2) 得到钟面积极为8 extac Sn CID) chy O";
    expect(isHardGarbageGatewayPlainText(bad)).toBe(true);
    expect(rankGatewayPlainTextCandidate(good)).toBeGreaterThan(0);
    const out = pickBestGatewayOcrPlainText({
      pipelinePlain: good,
      raw: { text: bad, blocks: [] },
    });
    expect(out).toContain("A(0,5)");
    expect(out).not.toMatch(/钟面积极/);
  });

  it("prefers longer raw text when pipeline plain is nearly empty", () => {
    const long =
      "(22)在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)。";
    const out = pickBestGatewayOcrPlainText({
      pipelinePlain: "A\nD E",
      raw: { text: long, blocks: [{ kind: "text", text: "A" }] },
    });
    expect(out).toContain("平面直角坐标系");
  });
});
