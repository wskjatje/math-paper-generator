/**
 * 听力本地声纹克隆档案：解析、年级档匹配（纯函数，无默认语速臆造）。
 */

export type ListeningTtsVoiceSlot = {
  voice: string;
  referenceWav?: string;
  label?: string;
};

export type ListeningTtsGradeBand = {
  id: string;
  label?: string;
  matchSubjectSubstrings: string[];
  speed: number;
  cueGapSec: number;
  turnGapSec: number;
};

export type ListeningTtsReferenceAudio = {
  bodyField: string;
  encoding: "base64" | "data_url";
};

export type ListeningTtsEndpoint = {
  baseUrl: string;
  apiKey: string;
  model: string;
  responseFormat: "wav" | "mp3" | "opus" | "aac" | "flac" | "pcm";
  extraBody: Record<string, unknown>;
};

export type ListeningTtsProfile = {
  version: 1;
  calibrated: boolean;
  calibrationNote?: string;
  endpoint: ListeningTtsEndpoint;
  slots: {
    narrator: ListeningTtsVoiceSlot;
    dialogue: ListeningTtsVoiceSlot[];
  };
  referenceAudio?: ListeningTtsReferenceAudio;
  gradeBands: ListeningTtsGradeBand[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNonEmptyString(v: unknown, path: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`听力 TTS 档案无效：${path} 须为非空字符串`);
  }
  return v.trim();
}

function asNumberInRange(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`听力 TTS 档案无效：${path} 须为 ${min}–${max} 之间的有限数字`);
  }
  return v;
}

function parseVoiceSlot(raw: unknown, path: string): ListeningTtsVoiceSlot {
  if (!isPlainObject(raw)) throw new Error(`听力 TTS 档案无效：${path} 须为对象`);
  const voice = asNonEmptyString(raw.voice, `${path}.voice`);
  const slot: ListeningTtsVoiceSlot = { voice };
  if (raw.referenceWav != null) {
    slot.referenceWav = asNonEmptyString(raw.referenceWav, `${path}.referenceWav`);
  }
  if (raw.label != null) {
    slot.label = asNonEmptyString(raw.label, `${path}.label`);
  }
  return slot;
}

/** 解析并校验档案；不因 calibrated=false 而拒绝解析（合成阶段再闸）。 */
export function parseListeningTtsProfile(raw: unknown): ListeningTtsProfile {
  if (!isPlainObject(raw)) throw new Error("听力 TTS 档案无效：根须为对象");
  if (raw.version !== 1) throw new Error("听力 TTS 档案无效：version 须为 1");
  if (typeof raw.calibrated !== "boolean") {
    throw new Error("听力 TTS 档案无效：calibrated 须为 boolean");
  }

  if (!isPlainObject(raw.endpoint)) throw new Error("听力 TTS 档案无效：endpoint 须为对象");
  const fmt = asNonEmptyString(raw.endpoint.responseFormat, "endpoint.responseFormat");
  const allowedFmt = new Set(["wav", "mp3", "opus", "aac", "flac", "pcm"]);
  if (!allowedFmt.has(fmt)) {
    throw new Error(`听力 TTS 档案无效：endpoint.responseFormat=${fmt}`);
  }
  let extraBody: Record<string, unknown> = {};
  if (raw.endpoint.extraBody != null) {
    if (!isPlainObject(raw.endpoint.extraBody)) {
      throw new Error("听力 TTS 档案无效：endpoint.extraBody 须为对象");
    }
    extraBody = { ...raw.endpoint.extraBody };
  }
  const endpoint: ListeningTtsEndpoint = {
    baseUrl: asNonEmptyString(raw.endpoint.baseUrl, "endpoint.baseUrl").replace(/\/+$/, ""),
    apiKey: typeof raw.endpoint.apiKey === "string" ? raw.endpoint.apiKey : "",
    model: asNonEmptyString(raw.endpoint.model, "endpoint.model"),
    responseFormat: fmt as ListeningTtsEndpoint["responseFormat"],
    extraBody,
  };

  if (!isPlainObject(raw.slots)) throw new Error("听力 TTS 档案无效：slots 须为对象");
  const narrator = parseVoiceSlot(raw.slots.narrator, "slots.narrator");
  if (!Array.isArray(raw.slots.dialogue) || raw.slots.dialogue.length < 1) {
    throw new Error("听力 TTS 档案无效：slots.dialogue 须为长度≥1 的数组");
  }
  const dialogue = raw.slots.dialogue.map((s, i) => parseVoiceSlot(s, `slots.dialogue[${i}]`));

  let referenceAudio: ListeningTtsReferenceAudio | undefined;
  if (raw.referenceAudio != null) {
    if (!isPlainObject(raw.referenceAudio)) {
      throw new Error("听力 TTS 档案无效：referenceAudio 须为对象");
    }
    const encoding = asNonEmptyString(raw.referenceAudio.encoding, "referenceAudio.encoding");
    if (encoding !== "base64" && encoding !== "data_url") {
      throw new Error("听力 TTS 档案无效：referenceAudio.encoding 须为 base64|data_url");
    }
    referenceAudio = {
      bodyField: asNonEmptyString(raw.referenceAudio.bodyField, "referenceAudio.bodyField"),
      encoding,
    };
  }

  if (!Array.isArray(raw.gradeBands) || raw.gradeBands.length < 1) {
    throw new Error("听力 TTS 档案无效：gradeBands 须为非空数组");
  }
  const gradeBands: ListeningTtsGradeBand[] = raw.gradeBands.map((b, i) => {
    if (!isPlainObject(b)) throw new Error(`听力 TTS 档案无效：gradeBands[${i}] 须为对象`);
    const matchSubjectSubstrings = b.matchSubjectSubstrings;
    if (!Array.isArray(matchSubjectSubstrings) || matchSubjectSubstrings.length < 1) {
      throw new Error(`听力 TTS 档案无效：gradeBands[${i}].matchSubjectSubstrings 须为非空数组`);
    }
    const band: ListeningTtsGradeBand = {
      id: asNonEmptyString(b.id, `gradeBands[${i}].id`),
      matchSubjectSubstrings: matchSubjectSubstrings.map((s, j) =>
        asNonEmptyString(s, `gradeBands[${i}].matchSubjectSubstrings[${j}]`),
      ),
      speed: asNumberInRange(b.speed, `gradeBands[${i}].speed`, 0.25, 4),
      cueGapSec: asNumberInRange(b.cueGapSec, `gradeBands[${i}].cueGapSec`, 0, 6),
      turnGapSec: asNumberInRange(b.turnGapSec, `gradeBands[${i}].turnGapSec`, 0, 6),
    };
    if (b.label != null) band.label = asNonEmptyString(b.label, `gradeBands[${i}].label`);
    return band;
  });

  const profile: ListeningTtsProfile = {
    version: 1,
    calibrated: raw.calibrated,
    endpoint,
    slots: { narrator, dialogue },
    gradeBands,
  };
  if (typeof raw.calibrationNote === "string" && raw.calibrationNote.trim()) {
    profile.calibrationNote = raw.calibrationNote.trim();
  }
  if (referenceAudio) profile.referenceAudio = referenceAudio;
  return profile;
}

/**
 * 用试卷/题目 subjects 文本匹配年级档；多档命中时取**先声明**的一档（档案作者控制优先级）。
 * 无命中则抛错（单路径、不静默默认年级）。
 */
export function resolveListeningGradeBand(
  profile: ListeningTtsProfile,
  subjectTexts: string[],
): ListeningTtsGradeBand {
  const blob = subjectTexts
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
  if (!blob) {
    throw new Error(
      "无法匹配听力年级档：试卷 subjects / 题目 subject 为空。请在档案 gradeBands.matchSubjectSubstrings 与卷面年级标签对齐。",
    );
  }
  for (const band of profile.gradeBands) {
    for (const sub of band.matchSubjectSubstrings) {
      if (blob.includes(sub)) return band;
    }
  }
  throw new Error(
    `无法匹配听力年级档：subjects=[${subjectTexts.join(" | ")}]。请在 data/listening-tts/profile.json 的 gradeBands 中增加匹配子串，或修正卷面年级标签。`,
  );
}

/** 旁白 + 对话槽 voice id 列表（对话按出现顺序轮询） */
export function listeningProfileDialogueVoiceIds(profile: ListeningTtsProfile): string[] {
  return profile.slots.dialogue.map((d) => d.voice);
}

export function assertListeningProfileReadyForSynth(profile: ListeningTtsProfile): void {
  if (!profile.calibrated) {
    throw new Error(
      "听力语音档案尚未标定，请完成语速标定后再生成音频。",
    );
  }
  const model = profile.endpoint.model;
  if (/^REPLACE_/i.test(model) || model.includes("REPLACE_WITH")) {
    throw new Error("听力 TTS 档案 endpoint.model 仍为占位符，请改为本机服务真实模型 id");
  }
  if (/^REPLACE_/i.test(profile.slots.narrator.voice)) {
    throw new Error("听力 TTS 档案 slots.narrator.voice 仍为占位符");
  }
  for (let i = 0; i < profile.slots.dialogue.length; i += 1) {
    if (/^REPLACE_/i.test(profile.slots.dialogue[i]!.voice)) {
      throw new Error(`听力 TTS 档案 slots.dialogue[${i}].voice 仍为占位符`);
    }
  }
  if (profile.referenceAudio && /^REPLACE_/i.test(profile.referenceAudio.bodyField)) {
    throw new Error(
      "听力 TTS 档案 referenceAudio.bodyField 仍为占位符；若不需要随请求传参考音频，请删除 referenceAudio 整段",
    );
  }
}
