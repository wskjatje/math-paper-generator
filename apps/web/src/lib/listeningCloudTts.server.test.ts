import { describe, expect, it, afterEach } from "vitest";
import {
  openAiCompatAudioSpeechUrl,
  resolveListeningCloudTtsConfig,
} from "@/lib/listeningCloudTts.server";

const KEYS = [
  "MPG_LISTENING_TTS_BASE_URL",
  "MPG_LISTENING_TTS_API_KEY",
  "MPG_LISTENING_TTS_MODEL",
  "MPG_LISTENING_TTS_VOICE",
  "MPG_LISTENING_TTS_DIALOGUE_VOICES",
  "MPG_LISTENING_TTS_INSTRUCTIONS",
  "MPG_LISTENING_TTS_SPEED",
  "MPG_LISTENING_TTS_FORMAT",
] as const;

describe("listeningCloudTts.server", () => {
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("全部未设时返回 null", () => {
    expect(resolveListeningCloudTtsConfig()).toBeNull();
  });

  it("半配置抛错", () => {
    process.env.MPG_LISTENING_TTS_API_KEY = "sk-test";
    expect(() => resolveListeningCloudTtsConfig()).toThrow(/不完整/);
  });

  it("完整配置解析对话音色与可选字段", () => {
    process.env.MPG_LISTENING_TTS_BASE_URL = "https://api.openai.com/v1/";
    process.env.MPG_LISTENING_TTS_API_KEY = "sk-test";
    process.env.MPG_LISTENING_TTS_MODEL = "tts-1-hd";
    process.env.MPG_LISTENING_TTS_VOICE = "nova";
    process.env.MPG_LISTENING_TTS_DIALOGUE_VOICES = "nova,onyx";
    process.env.MPG_LISTENING_TTS_INSTRUCTIONS = "Clear exam English.";
    process.env.MPG_LISTENING_TTS_SPEED = "0.95";

    const cfg = resolveListeningCloudTtsConfig();
    expect(cfg).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      model: "tts-1-hd",
      voice: "nova",
      dialogueVoices: ["nova", "onyx"],
      instructions: "Clear exam English.",
      speed: 0.95,
      responseFormat: "wav",
    });
    expect(openAiCompatAudioSpeechUrl(cfg!.baseUrl)).toBe(
      "https://api.openai.com/v1/audio/speech",
    );
  });
});
