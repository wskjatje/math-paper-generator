/**
 * 听力朗读韵律：对话轮次、角色标签、双档停顿。
 * 角色名仅从材料中的 `Name:` 前缀推断；音色映射由调用方按「出现顺序 → 配置列表」完成，不按性别臆测。
 */

import { chunkListeningPassageSentences } from "@/lib/listeningPassage.shared";

/** 材料内句间 / 对话轮次停顿（宜短） */
export const LISTENING_TURN_GAP = "__TURN_GAP__";

/** 考场结构停顿：题号、复听提示、材料与听后问句之间（可较长） */
export const LISTENING_CUE_GAP = "__WORD_GAP__";

/** 不参与对话角色切分的标签（题干/指令用语） */
const RESERVED_ROLE_LABELS = new Set([
  "question",
  "questions",
  "option",
  "options",
  "answer",
  "answers",
  "note",
  "notes",
  "section",
  "example",
  "examples",
  "track",
  "audio",
  "script",
  "choose",
  "listen",
  "part",
  "direction",
  "directions",
  "instruction",
  "instructions",
  "here",
  "passage",
  "conversation",
  "narrator",
]);

export type ListeningSpeechTurn = { role: string | null; text: string };

function normalizeRoleKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function isReservedRoleLabel(label: string): boolean {
  return RESERVED_ROLE_LABELS.has(normalizeRoleKey(label));
}

/**
 * 对话角色前缀：须以大写开头，最多三词，不含句点（避免误吃 `p.m. Woman:`）。
 * 仅结构推断，不枚举 Woman/Man 等词表。
 */
const ROLE_LABEL_CORE = "[A-Z][A-Za-z]{0,24}(?:\\s+[A-Z][A-Za-z0-9]{0,24}){0,2}";
const ROLE_LABEL_AT = new RegExp(`(?:^|(?<=\\s))(${ROLE_LABEL_CORE}):\\s+`, "g");
const LEADING_ROLE_RE = new RegExp(`^(${ROLE_LABEL_CORE}):\\s+([\\s\\S]+)$`);

/**
 * 从材料中收集对话角色标签（按首次出现顺序）。
 * 仅匹配行首/空白后的 `Name:`；忽略 Question: 等保留词。
 */
export function extractDialogueRoleLabels(passage: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(ROLE_LABEL_AT.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(passage)) !== null) {
    const label = m[1]?.trim() ?? "";
    if (!label || isReservedRoleLabel(label)) continue;
    const key = normalizeRoleKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * 按角色前缀切成轮次；若无 ≥2 个对话角色，则按句切并标记 role=null。
 */
export function splitListeningPassageTurns(passage: string): ListeningSpeechTurn[] {
  const raw = passage.trim();
  if (!raw) return [];

  const roles = extractDialogueRoleLabels(raw);
  if (roles.length < 2) {
    return chunkListeningPassageSentences(raw).map((text) => ({ role: null, text }));
  }

  const roleAlt = roles
    .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|");
  const splitRe = new RegExp(`(?=\\b(?:${roleAlt}):\\s+)`, "g");
  const chunks = raw
    .split(splitRe)
    .map((c) => c.trim())
    .filter(Boolean);

  const turns: ListeningSpeechTurn[] = [];
  const leadRe = new RegExp(`^(${roleAlt}):\\s+([\\s\\S]+)$`);
  for (const chunk of chunks) {
    const m = chunk.match(leadRe);
    if (m?.[1] && m[2]?.trim()) {
      turns.push({ role: m[1].trim(), text: m[2].trim() });
    } else if (chunk) {
      turns.push({ role: null, text: chunk });
    }
  }
  return turns.length > 0 ? turns : [{ role: null, text: raw }];
}

/**
 * 拼材料朗读串：轮次间用 `__TURN_GAP__`。
 * 稿面保留 `Role:` 前缀便于人工核对；合成阶段再按配置剥离并映射音色。
 */
export function formatPassageTurnsForSpeech(turns: ListeningSpeechTurn[]): string {
  const parts: string[] = [];
  for (const t of turns) {
    const body = t.text.trim();
    if (!body) continue;
    if (t.role) {
      parts.push(`${t.role}: ${body}`);
    } else {
      parts.push(body);
    }
  }
  return parts.join(` ${LISTENING_TURN_GAP} `);
}

export function buildPassageSpeechWithProsody(passage: string): string {
  return formatPassageTurnsForSpeech(splitListeningPassageTurns(passage));
}

/**
 * 合成前处理单段：可选剥离对话角色前缀；返回角色名供音色映射。
 */
export function prepareSpokenSegment(
  segment: string,
  opts: { speakRoleLabels: boolean },
): { role: string | null; text: string } {
  const raw = segment.trim();
  if (!raw) return { role: null, text: "" };

  const m = raw.match(LEADING_ROLE_RE);
  if (!m?.[1] || !m[2]?.trim()) {
    return { role: null, text: raw };
  }
  const label = m[1].trim();
  if (isReservedRoleLabel(label)) {
    return { role: null, text: raw };
  }
  const body = m[2].trim();
  if (opts.speakRoleLabels) {
    return { role: label, text: `${label}. ${body}` };
  }
  return { role: label, text: body };
}

export type ListeningPauseExpandOpts = {
  usePiper: boolean;
  /** 结构停顿（`__WORD_GAP__`），秒 */
  cueGapSec: number;
  /** 轮次/句间停顿（`__TURN_GAP__`），秒 */
  turnGapSec: number;
};

function pauseToken(sec: number, usePiper: boolean): string {
  if (sec <= 0) return " ";
  if (usePiper) {
    // Piper 无精确静音标记；用短句读近似（秒数越大点越多，有上限）
    const dots = Math.min(6, Math.max(1, Math.round(sec * 2)));
    return ` ${".".repeat(dots)} `;
  }
  const ms = Math.max(0, Math.round(sec * 1000));
  return ` [[slnc ${ms}]] `;
}

/** 将 `__TURN_GAP__` / `__WORD_GAP__` 展开为引擎可播停顿 */
export function expandListeningPauseTokens(script: string, opts: ListeningPauseExpandOpts): string {
  if (!script) return script;
  let out = script;
  out = out.replaceAll(LISTENING_TURN_GAP, pauseToken(opts.turnGapSec, opts.usePiper));
  out = out.replaceAll(LISTENING_CUE_GAP, pauseToken(opts.cueGapSec, opts.usePiper));
  return out;
}

/**
 * 按「角色首次出现顺序」映射到音色列表；无角色或列表为空时用默认音色。
 * 不按 Woman/Man 等词义猜性别。
 */
export function mapRoleToVoice(
  role: string | null,
  roleOrder: string[],
  dialogueVoices: string[],
  defaultVoice: string,
): string {
  if (!role || dialogueVoices.length === 0) return defaultVoice;
  const key = normalizeRoleKey(role);
  const idx = roleOrder.findIndex((r) => normalizeRoleKey(r) === key);
  if (idx < 0) return defaultVoice;
  return dialogueVoices[idx % dialogueVoices.length] ?? defaultVoice;
}

export type SayProsodySegment =
  | { kind: "speak"; voice: string; text: string }
  | { kind: "silence"; sec: number };

/**
 * 将带停顿 token 的脚本拆成「分段 say + 静音」计划。
 * 实测：单次 `say` 内多次 `[[voice]]` 切换在长稿上会截断，故合成须按段调用。
 */
export function buildSayProsodyPlan(
  scriptWithGapTokens: string,
  opts: {
    speakRoleLabels: boolean;
    defaultVoice: string;
    dialogueVoices: string[];
    cueGapSec: number;
    turnGapSec: number;
  },
): SayProsodySegment[] {
  const pieces = scriptWithGapTokens
    .split(/(__TURN_GAP__|__WORD_GAP__)/)
    .map((p) => p.trim())
    .filter(Boolean);

  const roleOrder: string[] = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    if (p === LISTENING_TURN_GAP || p === LISTENING_CUE_GAP) continue;
    const { role } = prepareSpokenSegment(p, { speakRoleLabels: opts.speakRoleLabels });
    if (!role) continue;
    const key = normalizeRoleKey(role);
    if (seen.has(key)) continue;
    seen.add(key);
    roleOrder.push(role);
  }

  const plan: SayProsodySegment[] = [];
  for (const p of pieces) {
    if (p === LISTENING_TURN_GAP) {
      if (opts.turnGapSec > 0) plan.push({ kind: "silence", sec: opts.turnGapSec });
      continue;
    }
    if (p === LISTENING_CUE_GAP) {
      if (opts.cueGapSec > 0) plan.push({ kind: "silence", sec: opts.cueGapSec });
      continue;
    }
    const prepared = prepareSpokenSegment(p, { speakRoleLabels: opts.speakRoleLabels });
    if (!prepared.text) continue;
    const voice = mapRoleToVoice(
      prepared.role,
      roleOrder,
      opts.dialogueVoices,
      opts.defaultVoice,
    );
    const last = plan[plan.length - 1];
    if (last?.kind === "speak" && last.voice === voice) {
      last.text = `${last.text} ${prepared.text}`.trim();
    } else {
      plan.push({ kind: "speak", voice, text: prepared.text });
    }
  }
  return plan;
}

/** 供人工核对的 say 预览稿（含 `[[voice]]` / `[[slnc]]`）；实际合成请用 buildSayProsodyPlan 分段。 */
export function renderSayScriptWithVoices(
  scriptWithGapTokens: string,
  opts: {
    speakRoleLabels: boolean;
    defaultVoice: string;
    dialogueVoices: string[];
    cueGapSec: number;
    turnGapSec: number;
  },
): string {
  const plan = buildSayProsodyPlan(scriptWithGapTokens, opts);
  const out: string[] = [];
  let lastVoice: string | null = null;
  for (const item of plan) {
    if (item.kind === "silence") {
      const ms = Math.max(0, Math.round(item.sec * 1000));
      out.push(`[[slnc ${ms}]]`);
      continue;
    }
    if (item.voice !== lastVoice) {
      out.push(`[[voice ${item.voice}]]`);
      lastVoice = item.voice;
    }
    out.push(item.text);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Piper：剥离角色前缀与 say 专用标记后，再展开停顿近似 */
export function renderPiperScript(
  scriptWithGapTokens: string,
  opts: { speakRoleLabels: boolean; cueGapSec: number; turnGapSec: number },
): string {
  const pieces = scriptWithGapTokens
    .split(/(__TURN_GAP__|__WORD_GAP__)/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const p of pieces) {
    if (p === LISTENING_TURN_GAP || p === LISTENING_CUE_GAP) {
      out.push(p);
      continue;
    }
    const prepared = prepareSpokenSegment(p, { speakRoleLabels: opts.speakRoleLabels });
    if (prepared.text) out.push(prepared.text);
  }

  return expandListeningPauseTokens(out.join(" "), {
    usePiper: true,
    cueGapSec: opts.cueGapSec,
    turnGapSec: opts.turnGapSec,
  })
    .replace(/\s+/g, " ")
    .trim();
}
