# 参考音频目录

旁路按 **文件名 = voice id** 克隆。默认需要：

- `narrator.wav` — 旁白
- `dialogue-a.wav` — 对话槽 0
- `dialogue-b.wav` — 对话槽 1

缺文件时，`npm run listening-tts:ensure` 会从仓库内  
`data/listening-tts/vendor/voice-pack.zip` 自动展开（溯源见 `../vendor/ATTRIBUTION.md`）。

本目录 wav 默认 gitignore；**以 vendor zip 为换机真相**。
