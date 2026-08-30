import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isRuntimePublicKind,
  runtimePublicDirCandidates,
  runtimePublicUrlPrefix,
} from "@/lib/runtimePublicAssets.shared";

describe("runtimePublicAssets.shared", () => {
  it("recognizes audio/figures/explain kinds and URL prefixes", () => {
    expect(isRuntimePublicKind("audio")).toBe(true);
    expect(isRuntimePublicKind("figures")).toBe(true);
    expect(isRuntimePublicKind("explain")).toBe(true);
    expect(isRuntimePublicKind("fonts")).toBe(false);
    expect(runtimePublicUrlPrefix("audio")).toBe("/audio/");
    expect(runtimePublicUrlPrefix("figures")).toBe("/figures/");
    expect(runtimePublicUrlPrefix("explain")).toBe("/explain/");
  });

  it("derives candidate dirs from repo root without hard-coded absolutes", () => {
    const root = "/tmp/mpg-repo";
    const dirs = runtimePublicDirCandidates(root, "audio");
    expect(dirs).toEqual([
      path.join(root, "public", "audio"),
      path.join(root, "apps", "web", "public", "audio"),
    ]);
    const fig = runtimePublicDirCandidates(root, "figures");
    expect(fig[0]).toBe(path.join(root, "public", "figures"));
    expect(fig[1]).toContain(path.join("apps", "web", "public", "figures"));
  });
});
