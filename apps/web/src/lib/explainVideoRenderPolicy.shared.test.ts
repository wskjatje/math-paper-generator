import { describe, expect, it } from "vitest";
import { EXPLAIN_VIDEO } from "@/config/explainVideo";
import {
  assertSceneTemplateMapComplete,
  decideExplainRenderDispatch,
  isExplainBackendFallbackAllowed,
  parseExplainManimRuntime,
  parseExplainRenderBackend,
  resolveManimTemplateId,
} from "@/lib/explainVideoRenderPolicy.shared";

describe("explainVideoRenderPolicy", () => {
  it("keeps configured default backend as board_ffmpeg (no silent M1′ switch)", () => {
    expect(EXPLAIN_VIDEO.render.backend).toBe("board_ffmpeg");
    expect(EXPLAIN_VIDEO.render.allowBackendFallback).toBe(false);
  });

  it("defaults backend to board_ffmpeg", () => {
    expect(parseExplainRenderBackend(undefined)).toBe("board_ffmpeg");
    expect(parseExplainRenderBackend("")).toBe("board_ffmpeg");
  });

  it("parses known backends", () => {
    expect(parseExplainRenderBackend("manim_templates")).toBe("manim_templates");
    expect(parseExplainRenderBackend("code2video")).toBe("code2video");
  });

  it("always forbids backend fallback (R2)", () => {
    expect(isExplainBackendFallbackAllowed(false)).toBe(false);
    expect(isExplainBackendFallbackAllowed(true)).toBe(false);
    expect(isExplainBackendFallbackAllowed(undefined)).toBe(false);
  });

  it("rejects code2video without falling back to board", () => {
    const d = decideExplainRenderDispatch("code2video", true);
    expect(d).toEqual({
      kind: "reject",
      code: "code2video",
      messageKey: "code2videoNotEnabled",
    });
  });

  it("dispatches board and manim without fallback", () => {
    expect(decideExplainRenderDispatch("board_ffmpeg", true)).toEqual({
      kind: "board_ffmpeg",
    });
    expect(decideExplainRenderDispatch("manim_templates", false)).toEqual({
      kind: "manim_templates",
    });
  });

  it("validates manim runtime", () => {
    expect(parseExplainManimRuntime("local")).toBe("local");
    expect(parseExplainManimRuntime("docker")).toBe("docker");
    expect(parseExplainManimRuntime("k8s")).toBeNull();
  });

  it("fail-closed when scene template mapping missing", () => {
    expect(resolveManimTemplateId({ read_stem: "read_stem" }, "idea")).toBeUndefined();
    expect(
      assertSceneTemplateMapComplete(["read_stem", "idea"], {
        read_stem: "read_stem",
      }),
    ).toEqual({ ok: false, purpose: "idea" });
    expect(
      assertSceneTemplateMapComplete(["read_stem"], { read_stem: "read_stem" }),
    ).toEqual({ ok: true });
  });
});
