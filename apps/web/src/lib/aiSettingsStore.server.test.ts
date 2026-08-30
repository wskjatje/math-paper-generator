import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("aiSettingsStore.server", () => {
  let tmpRoot: string;
  let prevRoot: string | undefined;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "mpg-ai-settings-"));
    await writeFile(path.join(tmpRoot, "package.json"), JSON.stringify({ name: "tmp" }), "utf8");
    prevRoot = process.env.MPG_PROJECT_ROOT;
    process.env.MPG_PROJECT_ROOT = tmpRoot;
  });

  afterEach(async () => {
    if (prevRoot === undefined) delete process.env.MPG_PROJECT_ROOT;
    else process.env.MPG_PROJECT_ROOT = prevRoot;
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("round-trips model entries via project file", async () => {
    const { loadAiSettingsFromProjectFile, saveAiSettingsToProjectFile } = await import(
      "@/lib/aiSettingsStore.server"
    );
    const settings = {
      mode: "cloud" as const,
      cloudModel: "fixture/model",
      modelEntries: [
        {
          id: "cloud-1",
          kind: "cloud" as const,
          name: "Demo",
          model: "fixture/model",
          baseUrl: "https://example.test/v1",
          apiKey: "sk-test",
          enabled: true,
        },
      ],
      defaultModelEntryId: "cloud-1",
      subjectModelEntryIds: {},
    };

    await saveAiSettingsToProjectFile(settings);
    const loaded = await loadAiSettingsFromProjectFile();
    expect(loaded?.modelEntries?.map((e) => e.id)).toEqual(["cloud-1"]);
    expect(loaded?.defaultModelEntryId).toBe("cloud-1");

    const raw = await readFile(path.join(tmpRoot, "data", "ai-settings.json"), "utf8");
    expect(JSON.parse(raw).workspace_key).toBe("default");
  });

  it("loadWorkspace prefers the side with more model entries", async () => {
    const {
      saveAiSettingsToProjectFile,
      loadWorkspaceAiSettings,
    } = await import("@/lib/aiSettingsStore.server");
    await saveAiSettingsToProjectFile({
      mode: "local",
      localBaseUrl: "http://127.0.0.1:11434",
      localModel: "a",
      modelEntries: [
        {
          id: "local-a",
          kind: "local",
          name: "a",
          model: "a",
          baseUrl: "http://127.0.0.1:11434",
          enabled: true,
        },
        {
          id: "local-b",
          kind: "local",
          name: "b",
          model: "b",
          baseUrl: "http://127.0.0.1:11434",
          enabled: true,
        },
      ],
      defaultModelEntryId: "local-a",
      subjectModelEntryIds: {},
    });
    const loaded = await loadWorkspaceAiSettings();
    expect(loaded?.modelEntries?.length).toBe(2);
  });
});
