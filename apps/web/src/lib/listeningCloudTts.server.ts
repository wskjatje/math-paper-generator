/**
 * 听力云端神经 TTS（OpenAI 兼容 `POST /audio/speech`）。
 *
 * 仅在环境变量**完整配置**时启用；不内置供应商、模型或音色默认值（避免硬编码/瞎猜）。
 * 产出为神经合成语音，不是真人演员录音；调用方须按供应商政策向终端用户披露。
 */

export type ListeningCloudTtsConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 旁白 / 无角色映射时的音色 id（由配置方提供，须为端点所支持） */
  voice: string;
  /** 对话角色按首次出现顺序映射；空则全程用 voice */
  dialogueVoices: string[];
  /** 可选；部分模型（如 gpt-4o-mini-tts）支持 */
  instructions: string | null;
  /** 可选语速；未设则不传该字段 */
  speed: number | null;
  /** 请求的 response_format；默认 wav 便于本仓库拼接静音 */
  responseFormat: "wav" | "mp3" | "opus" | "aac" | "flac" | "pcm";
};

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function normalizeOpenAiCompatBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function openAiCompatAudioSpeechUrl(baseUrl: string): string {
  const base = normalizeOpenAiCompatBase(baseUrl);
  if (/\/audio\/speech$/i.test(base)) return base;
  return `${base}/audio/speech`;
}

/**
 * 解析云端听力 TTS 配置。
 * - 四项均空：返回 null（走 Piper / say）
 * - 任一项有值但不全：抛错（禁止半配置静默回退）
 */
export function resolveListeningCloudTtsConfig(): ListeningCloudTtsConfig | null {
  const baseUrl = trimEnv("MPG_LISTENING_TTS_BASE_URL");
  const apiKey = trimEnv("MPG_LISTENING_TTS_API_KEY");
  const model = trimEnv("MPG_LISTENING_TTS_MODEL");
  const voice = trimEnv("MPG_LISTENING_TTS_VOICE");

  const any = Boolean(baseUrl || apiKey || model || voice);
  const all = Boolean(baseUrl && apiKey && model && voice);
  if (!any) return null;
  if (!all) {
    throw new Error(
      "听力云端语音配置不完整：请在服务端同时配置地址、密钥、模型与音色（详见听力语音设置说明）。",
    );
  }

  const dialogueRaw = trimEnv("MPG_LISTENING_TTS_DIALOGUE_VOICES");
  const dialogueVoices = dialogueRaw
    ? dialogueRaw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const instructions = trimEnv("MPG_LISTENING_TTS_INSTRUCTIONS") || null;

  let speed: number | null = null;
  const speedRaw = trimEnv("MPG_LISTENING_TTS_SPEED");
  if (speedRaw) {
    const n = Number.parseFloat(speedRaw);
    if (!Number.isFinite(n) || n < 0.25 || n > 4) {
      throw new Error("听力云端语速须在 0.25–4 之间");
    }
    speed = n;
  }

  const fmtRaw = trimEnv("MPG_LISTENING_TTS_FORMAT").toLowerCase();
  const allowed = new Set(["wav", "mp3", "opus", "aac", "flac", "pcm"]);
  const responseFormat = (fmtRaw || "wav") as ListeningCloudTtsConfig["responseFormat"];
  if (!allowed.has(responseFormat)) {
    throw new Error(
      `MPG_LISTENING_TTS_FORMAT 无效：${fmtRaw}（允许 wav|mp3|opus|aac|flac|pcm）`,
    );
  }

  return {
    baseUrl: normalizeOpenAiCompatBase(baseUrl),
    apiKey,
    model,
    voice,
    dialogueVoices,
    instructions,
    speed,
    responseFormat,
  };
}

export type CloudSpeechRequest = {
  text: string;
  voice: string;
  config: ListeningCloudTtsConfig;
};

/**
 * 调用兼容端点生成一段音频二进制（格式由 config.responseFormat 决定）。
 */
export async function fetchListeningCloudSpeechAudio(
  req: CloudSpeechRequest,
): Promise<{ bytes: Buffer; contentType: string | null }> {
  const { text, voice, config } = req;
  const input = text.trim();
  if (!input) {
    throw new Error("云端 TTS 输入文本为空");
  }

  const body: Record<string, unknown> = {
    model: config.model,
    input,
    voice,
    response_format: config.responseFormat,
  };
  if (config.instructions) {
    body.instructions = config.instructions;
  }
  if (config.speed != null) {
    body.speed = config.speed;
  }

  const url = openAiCompatAudioSpeechUrl(config.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = (await res.text().catch(() => "")).slice(0, 800);
    throw new Error(
      `听力云端 TTS 失败 HTTP ${res.status}（${url}）：${errText || res.statusText}`,
    );
  }

  const ab = await res.arrayBuffer();
  return {
    bytes: Buffer.from(ab),
    contentType: res.headers.get("content-type"),
  };
}
