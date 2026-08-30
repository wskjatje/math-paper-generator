import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupExpiredGenerationDrafts,
  deleteGenerationDraft,
  hasGenerationDraft,
  readGenerationDraft,
  saveGenerationDraft,
} from "./generationDraft.server";

let root = "";
let previousRoot: string | undefined;

/** 与 resolveProjectRoot 契约一致：须同时有 package.json + schemas/v1，否则会向上找到真实仓库根 */
async function seedTempMonorepoRoot(dir: string): Promise<void> {
  await writeFile(path.join(dir, "package.json"), "{}\n", "utf8");
  await mkdir(path.join(dir, "schemas", "v1"), { recursive: true });
}

beforeEach(async () => {
  previousRoot = process.env.MPG_PROJECT_ROOT;
  root = await mkdtemp(path.join(os.tmpdir(), "mpg-generation-draft-"));
  await seedTempMonorepoRoot(root);
  process.env.MPG_PROJECT_ROOT = root;
});

afterEach(async () => {
  if (previousRoot === undefined) delete process.env.MPG_PROJECT_ROOT;
  else process.env.MPG_PROJECT_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

describe("generation draft storage", () => {
  it("stores parsed output without requiring AI credentials and deletes it", async () => {
    await saveGenerationDraft({
      id: "job-12345678",
      phase: "model_returned",
      config: { subject: "math", title: "测试卷" },
      parsed: { questions: [{ content: "1+1", answer: "2" }] },
    });

    const draft = await readGenerationDraft("job-12345678");
    expect(draft?.phase).toBe("model_returned");
    expect(draft?.config).toEqual({ subject: "math", title: "测试卷" });
    expect((await hasGenerationDraft("job-12345678")).available).toBe(true);

    const serialized = await readFile(
      path.join(root, "data", "generation-drafts", "job-12345678.json"),
      "utf8",
    );
    expect(serialized).not.toContain("apiKey");

    await deleteGenerationDraft("job-12345678");
    expect((await hasGenerationDraft("job-12345678")).available).toBe(false);
  });

  it("removes expired drafts", async () => {
    await saveGenerationDraft({
      id: "job-expired-1234",
      phase: "validation_failed",
      config: { subject: "math" },
      parsed: { questions: [] },
      issues: ["校验失败"],
    });
    const removed = await cleanupExpiredGenerationDrafts(Date.now() + 25 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(await readGenerationDraft("job-expired-1234")).toBeNull();
  });
});
