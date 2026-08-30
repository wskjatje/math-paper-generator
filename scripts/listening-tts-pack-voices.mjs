#!/usr/bin/env node
/**
 * 将 data/listening-tts/samples 中必需 wav 打成可换机迁移的 zip。
 * 用法：node scripts/listening-tts-pack-voices.mjs [out.zip]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const samplesDir = path.join(root, "data", "listening-tts", "samples");
const out =
  process.argv[2]?.trim() ||
  path.join(root, "data", "listening-tts", "voice-pack.zip");

const required = ["narrator.wav", "dialogue-a.wav", "dialogue-b.wav"];
const missing = required.filter((f) => !existsSync(path.join(samplesDir, f)));
if (missing.length) {
  console.error(`缺少：${missing.join(", ")}（目录 ${samplesDir}）`);
  process.exit(1);
}

mkdirSync(path.dirname(out), { recursive: true });
execFileSync("zip", ["-j", out, ...required.map((f) => path.join(samplesDir, f))], {
  stdio: "inherit",
});
console.log(`已打包：${out}`);
console.log("换机：export MPG_LISTENING_TTS_VOICE_PACK=<该 zip 路径> && npm run listening-tts:ensure");
