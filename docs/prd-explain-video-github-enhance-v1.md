# 方案：用开源视频能力增强现网讲解成片（不替换主路径）

- 状态：**已拍板 A（P0）**（2026-08-19）；P1 broll / ComfyUI **不做**
- 日期：2026-08-19
- 性质：增强方案；**不改** [`prd-explain-video-optimal-v1.md`](./prd-explain-video-optimal-v1.md) 的 R1–R6
- 前提：现网主成片仍是 **讲义 IR → `manim_templates`（产品主）/ `board_ffmpeg`（过渡默认）**；Code2Video 仍为可选增强（M3）

---

## 1. 一句话

不把 CogVideoX / Wan / OpenMontage 等当成新的「讲义视频引擎」。只从它们拆出 **TTS、字幕、合成稳健性、可选装饰镜**，接到已过闸门的 `script.json` 上，让现网**更稳地出片、更好听好看**，教学内容画面仍由 Manim / 板书负责。

---

## 8. 拍板记录

| 日期 | 决议 |
|------|------|
| 2026-08-19 | **选 A**：落地 P0（TTS 显式回退 + narration 字幕烧录 + concat 重试/成片闸门）。`renderEnhance.enabled=true`；`broll.enabled=false`。不接文生视频/OpenMontage。关增强时行为回退为单引擎、无字幕增强。禁止硬编码引擎/瞎猜用途。 |

### P0 落地对照

| 项 | 配置 / 代码 |
|----|-------------|
| TTS 回退 | `renderEnhance.ttsEngineFallback` + `allowedTtsEngines`；`explainVideoTts.server.ts` |
| 字幕 | `renderEnhance.subtitles`；仅 IR `narration`；`explainVideoSubtitles.shared.ts` + synth 烧录 |
| 合成 | `renderEnhance.synth`；`explainVideoSynth.server.ts` |
| 主路径不变 | `render.backend` 仍默认 `board_ffmpeg`；不换 Manim/C2V |
---

## 2. 原则（相对最优方案不削弱）

| 编号 | 纪律 |
|------|------|
| **E0** | 权威输入仍是过闸门 `ExplainScriptV1`；禁止「一句话 / Any-Query」跳过讲义 |
| **E1** | 公式、标答、步骤画面 **不得** 用文生视频像素生成 |
| **E2** | 增强层失败：**不得**把失败标成讲解成功；也 **不得** 静默换 `render.backend`（继承 R2） |
| **E3** | 增强全部 **flag 默认关**；关时现网 M0/M1 行为不变（C4） |
| **E4** | 能力只进配置与适配器；禁止源码写死某仓库 CLI / 单卷特例（C1） |

「保证能生成」= 把现网成片链路的薄弱点补强（环境、口播、合成、字幕），**不是**再用一套 AI 视频重做教学内容。

---

## 3. 现网缺口 ↔ 可借用的开源能力

| 现网薄弱点 | 不该借 | 该借（适配器） |
|------------|--------|----------------|
| 教学内容动画 | CogVideoX / Wan / SVD 当主画面 | 继续 Manim 模板；复杂镜仍走可选 C2V |
| 口播仅 `say`/`piper`，mac 外易挂 | OpenMontage 整仓编排 | 多引擎 TTS 适配（piper 优先；可选 CosyVoice 等，配置名单） |
| 无字幕轨，听不清公式 | RedditBot 整套混剪 | ffmpeg 按 `narration` 烧软/硬字幕 |
| 合成失败信息不清、依赖探测粗 | Nano Cinema 整站替换 | 按 backend 的 readiness + 中文失败；可选 Docker 成片镜像 |
| 片头/转场单调 | 用大模型画「答案」 | 仅 `idea`/`summary` 等非答案镜可叠 **B-roll**（默认关） |
| 教师「一句话出片」冲动 | OpenMontage / RedditBot 主路径 | **不接入**；入口仍是选题 → 讲义闸门 → 成片 |

两类 GitHub 项目在本仓的角色：

```text
第一类 文生视频大模型  → 可选装饰轨（B-roll），永不进标答/步骤板书
第二类 自媒体流水线    → 拆 TTS / 字幕 / concat / 健康检查，不拆「写脚本+抓素材」
```

---

## 4. 目标架构（现网 + 增强轨）

```text
卷内题 → 讲义 IR（闸门）→ script.json
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        主画面轨           口播轨           可选装饰轨
     Manim / 板书        TTS 适配器        B-roll（flag）
     （权威、必有）      （增强现网引擎）   （禁止答案数字）
              │               │               │
              └────── ffmpeg 合成 + 字幕 ─────┘
                              │
                    public/explain/…/explain.mp4
```

主画面轨失败 → 整包 `failed`（与今日相同）。  
装饰轨失败 → **跳过装饰、仍用主画面成片**（这是「增强失败降级装饰」，**不是**换 backend；须在配置写明，且播放品质标记不得写成「AI 大片」）。

---

## 5. 分阶段交付（建议，不替换 M1′）

### P0 — 先让现网「更能出片」（不接大模型）

对「保证能生成」贡献最大，优先于任何 ComfyUI。

| # | 项 | 做法 | 借鉴来源（能力而非仓库绑定） |
|---|----|------|------------------------------|
| 1 | 完成 M1′ 条件 | Manim Docker/本机验收后，默认 `manim_templates` | 现网已拍板 |
| 2 | TTS 多引擎 | `render.ttsEngine` 扩展为配置列表；**显式顺序**（如 piper → say）；某一引擎失败再试下一个，**全部失败才 fail** | 流水线类项目的多 TTS |
| 3 | 字幕 | 由 `narration` 生成 SRT/ASS，ffmpeg 烧入；公式口播用 IR 原文，禁止模型另写字幕 | RedditBot 类字幕烧录 |
| 4 | 合成稳健 | concat 失败重试、成片体积/时长闸门、中文错误码 | 流水线健康检查 |

P0 **不**引入 CogVideoX / Wan / OpenMontage 进程。

### P1 — 可选装饰（仅当 P0 稳定）

| # | 项 | 口径 |
|---|----|------|
| 5 | ComfyUI **旁路 worker**（可选 Docker） | 只接收「非答案镜」提示词模板（配置：`idea`/`summary` 可用；`answer`/`step` 禁用） |
| 6 | 模型选型 | 国内中文：CogVideoX 或 Wan2.2；**默认关**；缺 GPU → readiness 提示，不影响 board/Manim |
| 7 | 叠法 | 底层短循环 + 上层 Manim 板书；或仅镜间 1s 转场 |
| 8 | 许可 | SVD 不作默认；商用倾向 Wan Apache；密钥/权重不进仓库 |

### P2 — 明确不做

- 用 OpenMontage / Nano Cinema / RedditBot **替换** `/explain-practice` 或 `render.backend`
- 用文生视频生成带公式、选项字母、标答数字的画面
- 增强层失败后把包标 `ready` 却无主画面轨

---

## 6. 配置草案（语义；键名实现可微调）

```json
"renderEnhance": {
  "enabled": false,
  "ttsEngineFallback": ["piper", "say"],
  "subtitles": { "enabled": true, "burnIn": true },
  "broll": {
    "enabled": false,
    "provider": "none",
    "allowedPurposes": ["idea", "summary"],
    "forbiddenPurposes": ["read_stem", "step", "answer", "pitfall"],
    "skipOnFailure": true
  }
}
```

- `skipOnFailure: true` 仅适用于 **broll**。  
- TTS / 主画面 / ffmpeg **不适用** skipOnFailure。

---

## 7. 验收

1. `renderEnhance.enabled=false`：与当前 M0/M1 行为一致。  
2. 仅开字幕/TTS 回退：无 GPU 也能出片；口播失败文案可行动。  
3. 开 broll 但无显卡：主片仍成功；日志/高级区可提示「装饰未生成」。  
4. 故意让 broll 生成「写有标答」的提示 → 配置拦截，不得进入 forbidden purposes。  
5. 覆盖闸门与 C3 仍成立。

---

## 8. 建议拍板

| 选项 | 含义 |
|------|------|
| **A（推荐）** | 先做 P0（TTS 回退 + 字幕 + 合成稳健），大模型/ComfyUI 进 P1 默认关 |
| **B** | P0 + 同步调研 ComfyUI 旁路，仍默认关 broll |
| **C** | 暂不增强，只推进 Manim M1′ |

开放题：本机是否有 NVIDIA ≥16GB？无则 **不要** 把 P1 当本迭代范围。
