# 本机声纹克隆听力 TTS（单路径 · 可换机）

听力合成**只走这一条路径**：本仓库旁路 `tools/listening-tts`（Chatterbox 克隆）+ `data/listening-tts/profile.json`。  
**无 Piper / macOS say / 云端回退**；档案未标定、参考声缺失、服务不可达、年级无法匹配时直接报错。

本仓库**不臆造**北京卷语速数字，也**不使用**未授权真题广播。默认参考声来自已溯源的 **CC0** 语音包（见下）；换机拉仓库后由 `ensure` 自动展开。

## 默认语音包（换机共用）

仓库已提交合规 CC0 包：`data/listening-tts/vendor/voice-pack.zip`（溯源见同目录 `ATTRIBUTION.md` / `manifest.json`）。

- 来源：[OwenTyme/voice-zero](https://github.com/OwenTyme/voice-zero)（面向 Chatterbox；LibriVox 公有领域）
- `ensure` 在缺 `samples/*.wav` 时**自动展开**该 zip；无需再网上下载
- **不是**北京真题广播；年级语速仍只写在 `calibration.json`

可选覆盖：`MPG_LISTENING_TTS_VOICE_PACK=/path/to/other.zip`

## 换机一次到位

```bash
brew install python@3.12 ffmpeg   # 若尚未安装
npm run listening-tts:setup      # 首次：装旁路依赖（可只做一次）
# 编辑 data/listening-tts/calibration.targets.json（目标 WPM + 出处）后：
npm run listening-tts:calibrate   # 对本机引擎实测并写出 calibrated=true
npm run devil
```

日常开发默认：`npm run devil`（只起前端；听力旁路**按需**在首次合成时拉起，避免常驻 Torch/MPS 占内存发热）。  
需要启动时就常驻旁路：`MPG_LISTENING_TTS_AUTOSTART=1 npm run devil` 或 `npm run devil -- --with-tts`。  
仅前端也可用 `npm run dev`。

成功 toast 引擎为 `local_clone`。本机需 **ffmpeg**（或 `MPG_FFMPEG_BIN`）。

### npm 脚本

| 脚本 | 作用 |
|------|------|
| `listening-tts:calibrate` | 实测基线 WPM，按 targets 写出 `calibration.json` |
| `devil` | soft-ensure 档案 + `vite dev`（**默认不起旁路**；合成时按需拉起） |
| `devil -- --with-tts` / `MPG_LISTENING_TTS_AUTOSTART=1` | 启动时拉起旁路（旧行为） |
| `dev` | 仅 vite（`predev` soft-ensure，不起旁路） |
| `listening-tts:setup` | 安装 venv + ensure + 后台启动旁路 |
| `listening-tts:install` | 仅安装 Python 依赖 |
| `listening-tts` | 前台跑旁路（`127.0.0.1:7778`） |
| `listening-tts:ensure` | 生成 `profile.json`；可加 `--soft` / `--start` |
| `listening-tts:pack-voices` | 把三份 wav 打成 zip 便于换机 |
| `listening-tts:stop` | 停 ensure/按需拉起的旁路 |
| `predev` | 仅 `npm run dev` 时：`ensure --soft` |

### 环境变量

| 变量 | 作用 |
|------|------|
| `MPG_LISTENING_TTS_PROFILE` | 覆盖档案路径 |
| `MPG_LISTENING_TTS_VOICE_PACK` | ensure 时 unzip 到 `samples/` |
| `MPG_LISTENING_TTS_AUTOSTART=1` | devil/ensure 时自动 `--start`（日常勿开） |
| `MPG_LISTENING_TTS_IDLE_UNLOAD_SEC` | 旁路空闲卸载模型秒数（默认 600；0=禁用） |
| `MPG_LISTENING_TTS_PYTHON` | 指定 Python ≥3.10 |
| `MPG_LISTENING_TTS_DEVICE` | `mps` / `cpu` / `cuda` |
| `MPG_LISTENING_TTS_SAMPLES` | 覆盖参考声目录 |
| `MPG_FFMPEG_BIN` | ffmpeg 路径 |

## 文件分工（可迁移 vs 本机）

| 路径 | 是否提交 | 说明 |
|------|----------|------|
| `profile.managed.json` | 是 | 旁路 endpoint / voice id 模板 |
| `calibration.json` | **建议提交** | 北京听力实测语速；`calibrated=true` 后换机即可用 |
| `calibration.example.json` | 是 | 标定模板（占位数字） |
| `profile.json` | 否（gitignore） | 由 ensure 生成，勿手改当真相 |
| `samples/*.wav` | 否（gitignore） | 工作副本；缺则从 vendor zip 展开 |
| `vendor/voice-pack.zip` | **是** | 全机共用默认参考声（CC0） |
| `vendor/ATTRIBUTION.md` / `manifest.json` | 是 | 溯源与 sha256 |
| `tools/listening-tts/` | 是 | Chatterbox OpenAI 兼容旁路 |

Schema：`schemas/v1/listening-tts-profile.schema.json`。

### 年级匹配

`gradeBands[].matchSubjectSubstrings` 与试卷 `subjects`、题目 `subject` 做**子串包含**匹配；多档命中时用档案中**先出现**的一档。  
卷面须带可匹配标签（如「初三」「中考」「初升高」）。

### 音色槽

| 槽 | voice id（旁路按文件名找 wav） |
|----|------|
| `slots.narrator` | `narrator` → `samples/narrator.wav` |
| `slots.dialogue[]` | `dialogue-a` / `dialogue-b` → 对应 wav；材料 `Name:` 按出现顺序轮询 |

## 采集说明（北京听力向）

- 环境安静、单声道、无 BGM；时长满足 Chatterbox 文档（通常约数秒～十余秒干净口语）。
- 旁白：稳、清；对话 A/B：可区分、考场可懂。
- **勿**直接商用扒真题广播当样本；书面授权优先。
- 语速/停顿：只写进 `calibration.json`，并在 `calibrationNote` 写明对照了哪一年卷、如何听感标定。

## 与旧文档关系

`docs/listening-piper-setup.md` 保留作历史参考；**当前产品听力生成不再使用 Piper/`say`/云端回退**。
