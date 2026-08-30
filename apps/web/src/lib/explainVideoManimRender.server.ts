import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import type { ExplainScriptV1 } from "@/lib/explainVideoTypes.shared";
import { probeExplainVideoReadiness } from "@/lib/explainVideoReady.server";
import {
  parseExplainManimRuntime,
  resolveManimTemplateId,
} from "@/lib/explainVideoRenderPolicy.shared";
import { synthExplainNarrationWav } from "@/lib/explainVideoTts.server";
import {
  assertExplainOutputGates,
  concatExplainClipsWithRetry,
  maybeBurnExplainSubtitles,
  probeExplainMediaDurationSec,
} from "@/lib/explainVideoSynth.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  runtimePublicPrimaryDir,
  syncRuntimePublicSubtree,
  writeRuntimePublicFile,
} from "@/lib/runtimePublicAssets.server";
import type { RuntimePublicKind } from "@/lib/runtimePublicAssets.shared";

const execFileAsync = promisify(execFile);

type RenderExplainVideoResult =
  | { ok: true; storageKey: string; checksum: string; publicUrl: string }
  | { ok: false; message: string };

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

async function findRenderedMp4(root: string, stem: string): Promise<string | null> {
  const { stdout } = await execFileAsync(
    "find",
    [root, "-type", "f", "-name", `${stem}.mp4`],
    { timeout: 15_000 },
  ).catch(() => ({ stdout: "" }));
  const first = stdout
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return first ?? null;
}

async function runManimOnce(input: {
  workAbs: string;
  sceneJsonAbs: string;
  scriptAbs: string;
  outStem: string;
  runtime: "local" | "docker";
}): Promise<{ ok: true; mp4: string } | { ok: false; message: string }> {
  const manim = EXPLAIN_VIDEO.render.manim;
  if (!manim) {
    return { ok: false, message: explainVideoMessage("manimMissing") };
  }
  const qualityFlag =
    manim.quality === "h" ? "-qh" : manim.quality === "m" ? "-qm" : "-ql";
  const sceneClass = manim.sceneClassName || "ExplainTemplateScene";
  const scriptName = path.basename(input.scriptAbs);
  const scriptInWork = path.join(input.workAbs, scriptName);
  await copyFile(input.scriptAbs, scriptInWork);

  const env = {
    ...process.env,
    EXPLAIN_SCENE_JSON: input.sceneJsonAbs,
  };

  try {
    if (input.runtime === "local") {
      const bin =
        process.env[manim.localBinEnv]?.trim() || manim.localBinName || "manim";
      await execFileAsync(
        bin,
        [
          qualityFlag,
          scriptInWork,
          sceneClass,
          "-o",
          input.outStem,
          "--media_dir",
          input.workAbs,
        ],
        { timeout: 300_000, env, cwd: input.workAbs },
      );
    } else {
      const dockerBin =
        process.env[manim.dockerBinEnv]?.trim() || manim.dockerBinName || "docker";
      const mount = manim.workdirMount || "/manim";
      const sceneInContainer = path.posix.join(
        mount,
        path.basename(input.sceneJsonAbs),
      );
      await execFileAsync(
        dockerBin,
        [
          "run",
          "--rm",
          "-v",
          `${input.workAbs}:${mount}`,
          "-e",
          `EXPLAIN_SCENE_JSON=${sceneInContainer}`,
          manim.dockerImage,
          "manim",
          qualityFlag,
          path.posix.join(mount, scriptName),
          sceneClass,
          "-o",
          input.outStem,
          "--media_dir",
          mount,
        ],
        { timeout: 420_000 },
      );
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : explainVideoMessage("renderFailed"),
    };
  }

  const mp4 = await findRenderedMp4(input.workAbs, input.outStem);
  if (!mp4) {
    return { ok: false, message: explainVideoMessage("renderFailed") };
  }
  return { ok: true, mp4 };
}

/**
 * IR → 确定性 Manim 模板 + 现网 TTS；失败不降级到 board。
 */
export async function renderExplainVideoManimTemplates(input: {
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

  const runtime = parseExplainManimRuntime(EXPLAIN_VIDEO.render.manimRuntime);
  if (!runtime) {
    return { ok: false, message: explainVideoMessage("manimRuntimeInvalid") };
  }

  const manimCfg = EXPLAIN_VIDEO.render.manim;
  if (!manimCfg?.scriptRelPath?.trim()) {
    return { ok: false, message: explainVideoMessage("manimMissing") };
  }
  const scriptAbs = path.join(resolveProjectRoot(), manimCfg.scriptRelPath);
  try {
    await access(scriptAbs, constants.R_OK);
  } catch {
    return { ok: false, message: explainVideoMessage("manimMissing") };
  }

  const map = EXPLAIN_VIDEO.render.manimTemplates?.sceneTemplateMap;
  for (const sc of input.script.scenes) {
    if (!resolveManimTemplateId(map, sc.purpose)) {
      return { ok: false, message: explainVideoMessage("manimTemplateMissing") };
    }
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
    for (let i = 0; i < input.script.scenes.length; i++) {
      const sc = input.script.scenes[i]!;
      const templateId = resolveManimTemplateId(map, sc.purpose)!;
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

      const sceneJson = path.join(workAbs, `scene-${i}.json`);
      await writeFile(
        sceneJson,
        JSON.stringify(
          {
            templateId,
            purpose: sc.purpose,
            onScreen: sc.onScreen,
            narration: sc.narration,
            durationSec: sc.durationSec,
          },
          null,
          2,
        ),
        "utf8",
      );

      const outStem = `v-${i}`;
      const manimOk = await runManimOnce({
        workAbs,
        sceneJsonAbs: sceneJson,
        scriptAbs,
        outStem,
        runtime,
      });
      if (!manimOk.ok) {
        return { ok: false, message: manimOk.message };
      }

      const clip = path.join(workAbs, `c-${i}.mp4`);
      await execFileAsync(
        readiness.ffmpegPath,
        [
          "-y",
          "-i",
          manimOk.mp4,
          "-i",
          wav,
          "-shortest",
          "-c:v",
          "libx264",
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
