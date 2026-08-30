# MPG 听力默认语音包溯源

本目录的 `voice-pack.zip` 供所有机器共用（`npm run listening-tts:ensure` 在缺样本时自动展开）。

## 来源（有据）

| 项目槽 | 上游文件 | 朗读人 | 上游口音栏 | LibriVox |
|--------|----------|--------|------------|----------|
| `narrator.wav` | `voices/christine_blachford.flac` | [Christine Blachford](https://librivox.org/reader/614) | English | [The Rosary, Track 23](https://librivox.org/the-rosary-by-florence-louisa-barclay/) |
| `dialogue-a.wav` | `voices/david_clark.flac` | [David Clark](https://librivox.org/reader/7408) | English | [Monte Cristo v3, Track 117](https://librivox.org/the-count-of-monte-cristo-version-3-by-alexandre-dumas/) |
| `dialogue-b.wav` | `voices/cori_samuel.flac` | [Cori Samuel](https://librivox.org/reader/92) | English | [Black Beauty v2, Track 1](https://librivox.org/black-beauty-by-anna-sewell-version-2/) |

- 上游仓库：[OwenTyme/voice-zero](https://github.com/OwenTyme/voice-zero)（明确面向 Chatterbox 零样本克隆）
- 固定提交：见 `voice-zero.sha`（`490cfbee850a6d409076f477c766f567000a79b6`）
- 许可：上游 `voices/` **CC0**；LibriVox 公有领域朗读
- 机器处理：`ffmpeg` → 24 kHz 单声道 PCM WAV（见 `manifest.json`）

校验哈希以 `manifest.json` 为准。

## 明确不是什么

- **不是**北京听力官方广播或未授权真题录音
- **不表示**已完成北京年级语速标定（仍改 `calibration.json`）

更换语音包时：更新 zip + `manifest.json` + 本文件，勿在代码里写死音色假设。
