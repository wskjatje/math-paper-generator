# Piper 本地听力合成（免费）

试卷详情页「生成听力音频」在配置了 Piper 后，会优先用本地神经 TTS 生成 `.wav`，音质通常好于 macOS `say`。未配置 `MPG_PIPER_MODEL` 时，在 macOS 上仍使用内置 `say`。

## 1. 安装 Piper 可执行文件（Apple Silicon）

1. 打开 [rhasspy/piper Releases](https://github.com/rhasspy/piper/releases)，下载 **`piper_macos_aarch64.tar.gz`**（与 M1/M2/M3 对应）。
2. **完整解压**后应包含 `piper` 可执行文件、`piper_phonemize`、`espeak-ng-data` 以及若干 **`.dylib`**（若解压目录里没有任何 `.dylib`，请重新下载压缩包或勿漏文件）。
3. 若在项目里解压成文件夹 **`piper/`**，真正的二进制通常是 **`piper/piper`**（内层文件），不是外层目录名。
4. 赋予执行权限：
   ```bash
   chmod +x ./piper/piper
   ```
5. 通过 **`MPG_PIPER_BIN`** 写可执行文件的**绝对路径**（推荐），或把该目录加入 **`PATH`**。

### `Library not loaded: libespeak-ng.1.dylib`

说明系统找不到 espeak 的动态库。任选其一：

**做法 A（推荐）**：用 Homebrew 安装 espeak-ng（会提供 `libespeak-ng`）：

```bash
brew install espeak-ng
```

本项目在调用 Piper 时会自动把 `/opt/homebrew/lib` 等常见路径加入 `DYLD_LIBRARY_PATH`；若仍报错，可手动导出后再试：

```bash
export DYLD_LIBRARY_PATH="/opt/homebrew/lib:$DYLD_LIBRARY_PATH"
./piper/piper --help
```

**做法 B**：重新解压官方 **`piper_macos_aarch64.tar.gz`**，确认包内含依赖库：

```bash
tar -tzf piper_macos_aarch64.tar.gz | grep '\.dylib'
```

也可自行通过 **`MPG_PIPER_LIB_PATH`** 追加库目录（多个路径用 `:` 分隔）。

### `incompatible architecture (have 'arm64', need 'x86_64')`

说明当前 **`piper` 可执行文件是 Intel（x86_64）**，而你本机通过 Homebrew 安装的 **`libespeak-ng` 是 Apple Silicon（arm64）**，两种架构不能混链。

**处理（推荐）**：

1. 到 [Piper Releases](https://github.com/rhasspy/piper/releases) 下载 **`piper_macos_aarch64.tar.gz`**（勿下载带 **x64 / amd64** 的包）。
2. 备份或删掉项目里旧的 **`piper/`** 目录，用 **aarch64** 压缩包**完整解压**后替换。
3. 自检架构：

   ```bash
   file ./piper/piper
   ```

   输出里应是 **`arm64`**（例如 `Mach-O 64-bit executable arm64`）。若仍是 **`x86_64`**，说明包下错了。

4. 再执行 `brew install espeak-ng`（arm64 Homebrew），然后：

   ```bash
   ./piper/piper --help
   ```

不建议走「装一套 x86 Homebrew + Rosetta」去配 Intel 版 Piper，折腾且易混环境。

## 2. 下载英语音色（ONNX）

在 [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) 中任选英文包，例如：

- `en/en_US/lessac/medium/` → `en_US-lessac-medium.onnx` 与 **`en_US-lessac-medium.onnx.json`**（需放在同一目录）。

将 `.onnx` 的**绝对路径**配置到环境变量 **`MPG_PIPER_MODEL`**（指向 `.onnx` 文件即可，Piper 会在同目录查找 `.json`）。

## 3. 配置环境变量

在启动开发服务前 export（或写入项目根目录 `.env`，勿提交密钥以外内容亦可）：

```bash
export MPG_PIPER_MODEL="/绝对路径/en_US-lessac-medium.onnx"
# 可执行文件绝对路径（解压目录的内层 piper）：
# export MPG_PIPER_BIN="/Users/你/Math Paper Generator/piper/piper"
# 可选：额外动态库搜索路径
# export MPG_PIPER_LIB_PATH="/opt/homebrew/opt/espeak-ng/lib"
# 可选：听力选项词间停顿秒数（默认 2.3）
# export MPG_LISTENING_WORD_GAP_SEC="2.3"
```

然后 `npm run dev`，在试卷页重新生成听力音频。

## 4. 自检

```bash
echo 'Hello from Piper.' | piper --model "$MPG_PIPER_MODEL" --output_file /tmp/piper-test.wav
afplay /tmp/piper-test.wav   # macOS 试听
```

## 5. 其它说明

- **Linux / Windows**：未配置 Piper 且非 macOS 时，不会使用 `say`；需配置 Piper 或仅在 macOS 开发机上生成。
- **语速 / 遍数 / 停顿**：`MPG_LISTENING_RATE_WPM`（仅 `say`）、`MPG_LISTENING_PLAYS`、`MPG_LISTENING_WORD_GAP_SEC`。其中词间停顿在 `say` 下为精确静音，在 Piper 下为近似句读停顿。

## 6. `listening-script.md` 格式约定（全卷统一）

路径：**试卷听力**为 `public/audio/<试卷ID>/listening-script.md`；**同型例题听力**为 `public/audio/<试卷ID>/examples/listening-script.md`（点击「生成例题音频」时写入，格式同为 v3）。由试卷详情对应按钮生成，也可手工改后再生成 WAV。**以后所有听力 md 均须遵守下列规则**（实现见 `src/lib/listeningScriptMarkdown.shared.ts`、`src/lib/listeningAudio.server.ts`）。

1. **文件头**：`<!-- mpg-listening-script v3 … -->`，便于区分版本。
2. **每轨结构**  
   - `## Track NN` 下面，**第一个单独成行 `---` 之上**：**朗读内层** —— 程序解析时**只取这一段**送 Piper/say。  
   - **第一个 `---` 之下**：`### 题面（…）`、**题目**、**选项** —— 仅作与题库核对，**不参与合成**。  
   - 轨末可再用 `---` 与下一轨分隔。
3. **朗读内层内的停顿**：题干按句号/问号等切成多句后，与 **Here are the choices.**、与各 **Option A, …** 之间，一律用 **`__WORD_GAP__`** 分隔（前后空格可有可无，推荐 ` __WORD_GAP__ `）。合成时会替换为 `say` 静音或 Piper 近似停顿。
4. **听力材料**：若题目「推导过程」中有可播内容，会与题干段用同类分隔拼接；不与题干重复插入固定英文衔接句 **「Now the question and choices.」**（已不再使用）。
5. **手工编辑**：若徒手写朗读层，须自行保留 **题面** 块与上述 **`__WORD_GAP__`** 规则，否则与考场停顿不一致。
