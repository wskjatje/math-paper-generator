/**
 * 本机声纹克隆 TTS（听力唯一合成路径）。
 * 协议：OpenAI 兼容 POST {baseUrl}/audio/speech；参考音频字段名由档案配置，不预设供应商。
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertListeningProfileReadyForSynth,
  parseListeningTtsProfile,
  type ListeningTtsGradeBand,
  type ListeningTtsProfile,
  type ListeningTtsVoiceSlot,
} from "@/lib/listeningTtsProfile.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export function listeningTtsProfilePath(): string {
  const fromEnv = process.env.MPG_LISTENING_TTS_PROFILE?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(resolveProjectRoot(), fromEnv);
  }
  return path.join(resolveProjectRoot(), "data", "listening-tts", "profile.json");
}

export async function loadListeningTtsProfile(): Promise<ListeningTtsProfile> {
  const file = listeningTtsProfilePath();
  let rawText: string;
  try {
    rawText = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `未找到听力 TTS 档案：${file}。请运行 npm run listening-tts:ensure（或 setup）生成 profile.json，并完成 calibration.json 标定。见 docs/listening-local-clone-tts.md`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`听力 TTS 档案不是合法 JSON：${file}`);
  }
  const profile = parseListeningTtsProfile(json);
  assertListeningProfileReadyForSynth(profile);
  return profile;
}

function openAiCompatAudioSpeechUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (/\/audio\/speech$/i.test(base)) return base;
  return `${base}/audio/speech`;
}

function resolveMaybeProjectPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(resolveProjectRoot(), p);
}

async function readReferencePayload(
  slot: ListeningTtsVoiceSlot,
  profile: ListeningTtsProfile,
): Promise<Record<string, unknown>> {
  if (!profile.referenceAudio) return {};
  const wavRel = slot.referenceWav?.trim();
  if (!wavRel) {
    throw new Error(
      `档案启用了 referenceAudio，但 voice=${slot.voice} 未配置 referenceWav`,
    );
  }
  const wavPath = resolveMaybeProjectPath(wavRel);
  try {
    await access(wavPath);
  } catch {
    throw new Error(`参考音频不存在：${wavPath}（voice=${slot.voice}）`);
  }
  const bytes = await readFile(wavPath);
  const b64 = bytes.toString("base64");
  const value =
    profile.referenceAudio.encoding === "data_url"
      ? `data:audio/wav;base64,${b64}`
      : b64;
  return { [profile.referenceAudio.bodyField]: value };
}

function findSlotForVoice(profile: ListeningTtsProfile, voice: string): ListeningTtsVoiceSlot {
  if (profile.slots.narrator.voice === voice) return profile.slots.narrator;
  const hit = profile.slots.dialogue.find((d) => d.voice === voice);
  if (hit) return hit;
  throw new Error(`语音槽位中找不到 voice=${voice}`);
}

export async function fetchLocalCloneSpeechAudio(input: {
  text: string;
  voice: string;
  speed: number;
  profile: ListeningTtsProfile;
}): Promise<Buffer> {
  const text = input.text.trim();
  if (!text) throw new Error("本地克隆 TTS 输入文本为空");

  const slot = findSlotForVoice(input.profile, input.voice);
  const refFields = await readReferencePayload(slot, input.profile);
  const body: Record<string, unknown> = {
    ...input.profile.endpoint.extraBody,
    model: input.profile.endpoint.model,
    input: text,
    voice: input.voice,
    speed: input.speed,
    response_format: input.profile.endpoint.responseFormat,
    ...refFields,
  };

  const url = openAiCompatAudioSpeechUrl(input.profile.endpoint.baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.profile.endpoint.apiKey.trim()) {
    headers.Authorization = `Bearer ${input.profile.endpoint.apiKey.trim()}`;
  }

  // 本机旁路：仅合成时拉起（devil/dev 默认不常驻，避免 Torch/MPS 占内存发热）
  if (/127\.0\.0\.1|localhost/i.test(url)) {
    const { ensureListeningTtsSidecarRunning } = await import(
      "@/lib/listeningTtsSidecar.server"
    );
    await ensureListeningTtsSidecarRunning();
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = (await res.text().catch(() => "")).slice(0, 800);
    throw new Error(
      `本地克隆 TTS 失败 HTTP ${res.status}（${url}）：${errText || res.statusText}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

export type LocalCloneProsody = {
  narratorVoice: string;
  dialogueVoices: string[];
  cueGapSec: number;
  turnGapSec: number;
  speed: number;
  band: ListeningTtsGradeBand;
};

export function localCloneProsodyFromProfile(
  profile: ListeningTtsProfile,
  band: ListeningTtsGradeBand,
): LocalCloneProsody {
  return {
    narratorVoice: profile.slots.narrator.voice,
    dialogueVoices: profile.slots.dialogue.map((d) => d.voice),
    cueGapSec: band.cueGapSec,
    turnGapSec: band.turnGapSec,
    speed: band.speed,
    band,
  };
}
