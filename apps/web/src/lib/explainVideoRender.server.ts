import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import type { ExplainScriptV1 } from "@/lib/explainVideoTypes.shared";
import { probeExplainVideoReadiness } from "@/lib/explainVideoReady.server";
import {
  requireExplainBoardFontOrThrow,
  writeExplainBoardPng,
} from "@/lib/explainVideoBoard.server";
import { decideExplainRenderDispatch } from "@/lib/explainVideoRenderPolicy.shared";
import { synthExplainNarrationWav } from "@/lib/explainVideoTts.server";
import {
  assertExplainOutputGates,
  concatExplainClipsWithRetry,
  maybeBurnExplainSubtitles,
  probeExplainMediaDurationSec,
} from "@/lib/explainVideoSynth.server";
import {
  runtimePublicPrimaryDir,
  syncRuntimePublicSubtree,
  writeRuntimePublicFile,
} from "@/lib/runtimePublicAssets.server";
import type { RuntimePublicKind } from "@/lib/runtimePublicAssets.shared";

const execFileAsync = promisify(execFile);

function explainKind(): RuntimePublicKind {
  const k = EXPLAIN_VIDEO.publicKind;
  if (k !== "explain") {
    throw new Error(`explain-video.json publicKind 须为 explain，当前为 ${k}`);
  }
  return "explain";
}

function storageKey(packageId: string, bandId: string): string {
  return EXPLAIN_VIDEO.storageKeyTemplate
    .replaceAll("{packageId}", packageId)
    .replaceAll("{bandId}", bandId);
}

export type RenderExplainVideoResult =
  | { ok: true; storageKey: string; checksum: string; publicUrl: string }
  | { ok: false; message: string };

/**
 * 板书口播成片：每镜 PNG 板书 + TTS；禁止纯色空画面冒充成片。
 */
export async function renderExplainVideoBoardFfmpeg(input: {
  packageId: string;
  bandId: string;
  script: ExplainScriptV1;
}): Promise<RenderExplainVideoResult> {
  const readiness = await probeExplainVideoReadiness();
  if (!readiness.ok || !readiness.ffmpegPath || !readiness.ttsEngine) {
    return {
      ok: false,
      message: readiness.reasons[0] ?? "讲解环境未就绪",
    };
  }

  const board = EXPLAIN_VIDEO.render.board;
  if (!board?.burnOnScreenText) {
    return {
      ok: false,
      message: "未启用板书画面（render.board.burnOnScreenText），拒绝生成仅语音片",
    };
  }

  let fontFile: string;
  try {
    fontFile = await requireExplainBoardFontOrThrow();
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : explainVideoMessage("boardFontMissing"),
    };
  }

  const kind = explainKind();
  const key = storageKey(input.packageId, input.bandId);
  const workRel = path.join(input.packageId, input.bandId, "_work");
  const workAbs = path.join(runtimePublicPrimaryDir(kind), workRel);
  await rm(workAbs, { recursive: true, force: true });
  await mkdir(workAbs, { recursive: true });

  try {
    const concatLines: string[] = [];
    const segments: { narration: string; durationSec: number }[] = [];
    const { frameWidth: w, frameHeight: h, fps } = EXPLAIN_VIDEO.render;
    for (let i = 0; i < input.script.scenes.length; i++) {
      const sc = input.script.scenes[i]!;
      const wav = path.join(workAbs, `n-${i}.wav`);
      await synthExplainNarrationWav(
        sc.narration,
        wav,
        readiness.ttsEngine,
        readiness.ffmpegPath,
      );
      const wavDur = await probeExplainMediaDurationSec(wav);
      const durationSec = wavDur.ok
        ? wavDur.durationSec
        : Math.max(1, Number(sc.durationSec) || 1);
      segments.push({ narration: sc.narration, durationSec });

      const png = path.join(workAbs, `b-${i}.png`);
      const boardOk = await writeExplainBoardPng({
        onScreen: sc.onScreen,
        outPath: png,
        fontFile,
        width: w,
        height: h,
      });
      if (!boardOk.ok) {
        return { ok: false, message: boardOk.message || "板书画面生成失败" };
      }
      const clip = path.join(workAbs, `c-${i}.mp4`);
      await execFileAsync(
        readiness.ffmpegPath,
        [
          "-y",
          "-loop",
          "1",
          "-framerate",
          String(Math.max(1, fps || 1)),
          "-i",
          png,
          "-i",
          wav,
          "-shortest",
          "-c:v",
          "libx264",
          "-tune",
          "stillimage",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          clip,
        ],
        { timeout: 180_000 },
      );
      concatLines.push(`file '${clip.replace(/'/g, "'\\''")}'`);
    }
    const listFile = path.join(workAbs, "list.txt");
    await writeFile(listFile, concatLines.join("\n"), "utf8");
    const outConcat = path.join(workAbs, "out-concat.mp4");
    const concatOk = await concatExplainClipsWithRetry({
      ffmpegPath: readiness.ffmpegPath,
      listFile,
      outPath: outConcat,
    });
    if (!concatOk.ok) return concatOk;

    const burned = await maybeBurnExplainSubtitles({
      ffmpegPath: readiness.ffmpegPath,
      workAbs,
      inPath: outConcat,
      outPath: path.join(workAbs, "out.mp4"),
      segments,
    });
    if (!burned.ok) return burned;

    const bytes = await readFile(burned.path);
    const gates = await assertExplainOutputGates({
      bytes,
      mediaPath: burned.path,
    });
    if (!gates.ok) return gates;

    const checksum = createHash("sha256").update(bytes).digest("hex");
    await writeRuntimePublicFile(kind, key, bytes);
    await writeRuntimePublicFile(
      kind,
      path.join(input.packageId, input.bandId, EXPLAIN_VIDEO.scriptJsonName),
      `${JSON.stringify(input.script, null, 2)}\n`,
    );
    await syncRuntimePublicSubtree(kind, path.join(input.packageId, input.bandId));
    await rm(workAbs, { recursive: true, force: true });
    return {
      ok: true,
      storageKey: key,
      checksum,
      publicUrl: `/${kind}/${key.split(path.sep).join("/")}`,
    };
  } catch (e) {
    await rm(workAbs, { recursive: true, force: true }).catch(() => undefined);
    return {
      ok: false,
      message: e instanceof Error ? e.message : explainVideoMessage("renderFailed"),
    };
  }
}

/**
 * 按配置 render.backend 分发；禁止失败静默改 board。
 */
export async function renderExplainVideoFromScript(input: {
  packageId: string;
  bandId: string;
  script: ExplainScriptV1;
}): Promise<RenderExplainVideoResult> {
  const decision = decideExplainRenderDispatch(
    EXPLAIN_VIDEO.render.backend,
    EXPLAIN_VIDEO.render.allowBackendFallback,
  );

  if (decision.kind === "reject") {
    return {
      ok: false,
      message: explainVideoMessage(decision.messageKey),
    };
  }

  if (decision.kind === "board_ffmpeg") {
    return renderExplainVideoBoardFfmpeg(input);
  }

  if (decision.kind === "manim_templates") {
    const { renderExplainVideoManimTemplates } = await import(
      "@/lib/explainVideoManimRender.server"
    );
    return renderExplainVideoManimTemplates(input);
  }

  return {
    ok: false,
    message: explainVideoMessage("backendFallbackForbidden"),
  };
}
