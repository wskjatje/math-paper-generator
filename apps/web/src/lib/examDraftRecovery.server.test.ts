/**
 * 导入草稿「处理已返回结果」与命题恢复共用修复闭环的回归测试。
 * 场景对应线上问题：模型返回的 figure_scene 缺题干点（如「题干出现点 S，scene 中缺失」），
 * 恢复时应走题图专项 AI 修复并记入审计学习，而不是原样重校验后永远失败。
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/figureSvgAi.server", () => ({
  generateFigureSceneFromQuestionText: vi.fn(),
}));

import { generateFigureSceneFromQuestionText } from "@/lib/figureSvgAi.server";
import { readGenerationDraft, saveGenerationDraft } from "./generationDraft.server";
import { recoverImportedParsedFromStoredDraft } from "./exam-generation.server";
import { listRecentGenerationLearningEventsSync } from "./generationLearning.server";

const generateSceneMock = vi.mocked(generateFigureSceneFromQuestionText);

let root = "";
let previousRoot: string | undefined;

/** 与 resolveProjectRoot 契约一致：须同时有 package.json + schemas/v1 */
async function seedTempMonorepoRoot(dir: string): Promise<void> {
  await writeFile(path.join(dir, "package.json"), "{}\n", "utf8");
  await mkdir(path.join(dir, "schemas", "v1"), { recursive: true });
}

beforeEach(async () => {
  previousRoot = process.env.MPG_PROJECT_ROOT;
  root = await mkdtemp(path.join(os.tmpdir(), "mpg-import-recover-"));
  await seedTempMonorepoRoot(root);
  process.env.MPG_PROJECT_ROOT = root;
  generateSceneMock.mockReset();
});

afterEach(async () => {
  if (previousRoot === undefined) delete process.env.MPG_PROJECT_ROOT;
  else process.env.MPG_PROJECT_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

/** 题干含点 S；草稿 scene 缺 S，确定性 heal 无法推断 → 必须走题图 AI 修复 */
const FIGURE_QUESTION = {
  type: "solution",
  subject: "数学",
  content: "如图，四边形 ABCD 的对角线 AC 与 BD 交于点 S，求证：△ABS 与 △CDS 相似。",
  answer: "由对顶角与内错角可得两组对应角相等，故 △ABS ∽ △CDS。",
  solution_steps: [
    { description: "指出对顶角相等", reasoning: "∠ASB 与 ∠CSD 为对顶角" },
    { description: "由平行或圆周角得第二组等角", reasoning: "结合已知条件得 ∠BAS = ∠DCS" },
  ],
  points: 12,
  attachments: [
    {
      kind: "figure",
      uri: "pending://figure",
      alt: "四边形 ABCD 与对角线交点",
      figure_scene: {
        pack: "math.geometry",
        version: 1,
        elements: [
          { type: "point", id: "A", x: 0, y: 0, label: "A" },
          { type: "point", id: "B", x: 4, y: 0, label: "B" },
          { type: "point", id: "C", x: 4, y: 4, label: "C" },
          { type: "point", id: "D", x: 0, y: 4, label: "D" },
          { type: "segment", from: "A", to: "C" },
          { type: "segment", from: "B", to: "D" },
        ],
      },
    },
  ],
};

/** AI 修复后应返回的完整 scene：补齐题干点 S（对角线交点） */
const REPAIRED_SCENE = {
  pack: "math.geometry",
  version: 1,
  elements: [
    { type: "point", id: "A", x: 0, y: 0, label: "A" },
    { type: "point", id: "B", x: 4, y: 0, label: "B" },
    { type: "point", id: "C", x: 4, y: 4, label: "C" },
    { type: "point", id: "D", x: 0, y: 4, label: "D" },
    { type: "point", id: "S", x: 2, y: 2, label: "S" },
    { type: "segment", from: "A", to: "B" },
    { type: "segment", from: "B", to: "C" },
    { type: "segment", from: "C", to: "D" },
    { type: "segment", from: "D", to: "A" },
    { type: "segment", from: "A", to: "C" },
    { type: "segment", from: "B", to: "D" },
  ],
};

async function saveImportDraft(id: string, question: Record<string, unknown>) {
  await saveGenerationDraft({
    id,
    phase: "validation_failed",
    config: { kind: "offline_import", subject: "math" },
    parsed: { title: "线下导入测试卷", questions: [question] },
    issues: ["第 1 题：figure_scene 未通过校验"],
  });
}

describe("recoverImportedParsedFromStoredDraft（导入草稿恢复共用闭环）", () => {
  it("scene 缺题干点时调用题图 AI 修复，通过后草稿标记 validated 并记录 repaired 学习事件", async () => {
    const draftId = "import-recover-ok-1";
    await saveImportDraft(draftId, FIGURE_QUESTION);
    generateSceneMock.mockResolvedValue(
      structuredClone(REPAIRED_SCENE) as unknown as Awaited<
        ReturnType<typeof generateFigureSceneFromQuestionText>
      >,
    );

    const draft = await readGenerationDraft(draftId);
    expect(draft).not.toBeNull();
    const parsed = await recoverImportedParsedFromStoredDraft(draft!);

    expect(generateSceneMock).toHaveBeenCalledTimes(1);
    const questions = parsed.questions as Array<Record<string, unknown>>;
    const attachments = questions[0]!.attachments as Array<Record<string, unknown>>;
    const scene = attachments.find((a) => a.kind === "figure")!.figure_scene as {
      elements: Array<{ id?: string }>;
    };
    expect(scene.elements.some((el) => el.id === "S")).toBe(true);

    const after = await readGenerationDraft(draftId);
    expect(after?.phase).toBe("validated");
    expect(after?.issues).toEqual([]);

    const events = listRecentGenerationLearningEventsSync(20);
    expect(
      events.some((e) => e.outcome === "repaired" && e.scope.stage === "figure"),
    ).toBe(true);
  });

  it("题图 AI 修复后仍未通过时写回草稿并记录 observed 学习事件（可再次恢复）", async () => {
    const draftId = "import-recover-fail-1";
    await saveImportDraft(draftId, FIGURE_QUESTION);
    generateSceneMock.mockResolvedValue(
      structuredClone(
        FIGURE_QUESTION.attachments[0]!.figure_scene,
      ) as unknown as Awaited<ReturnType<typeof generateFigureSceneFromQuestionText>>,
    );

    const draft = await readGenerationDraft(draftId);
    await expect(recoverImportedParsedFromStoredDraft(draft!)).rejects.toThrow(
      /题图专项修复后仍未通过校验/,
    );

    const after = await readGenerationDraft(draftId);
    expect(after?.phase).toBe("validation_failed");
    expect(after?.issues.length).toBeGreaterThan(0);

    const events = listRecentGenerationLearningEventsSync(20);
    expect(
      events.some((e) => e.outcome === "observed" && e.scope.stage === "figure"),
    ).toBe(true);
  });

  it("存在非题图错误（如空答案）时不猜测修补，直接给出明确错误", async () => {
    const draftId = "import-recover-nonfig-1";
    await saveImportDraft(draftId, { ...FIGURE_QUESTION, answer: "" });

    const draft = await readGenerationDraft(draftId);
    await expect(recoverImportedParsedFromStoredDraft(draft!)).rejects.toThrow(
      /非题图错误，不能自动猜测修补/,
    );
    expect(generateSceneMock).not.toHaveBeenCalled();
  });
});
