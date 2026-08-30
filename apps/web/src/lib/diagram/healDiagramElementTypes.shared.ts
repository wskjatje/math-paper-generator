/**
 * figure_scene.elements 缺 type / 写在别名字段时的表驱动治愈。
 * 规则优先来自 exam-domain.figureGeneration.elementTypeHeal；缺配置时用内置默认，禁止因 undefined 崩溃。
 */

import { FIGURE_GENERATION } from "@/config/examDomain";
import type {
  DiagramElementTypeHealConfig,
  DiagramElementTypeStructuralInferRule,
} from "@/config/examDomain";

/** 配置缺失时的安全默认（与 exam-domain.json 同构，非单卷硬编码） */
const DEFAULT_ELEMENT_TYPE_HEAL: DiagramElementTypeHealConfig = {
  typeFieldAliases: ["type", "kind", "element_type", "elementType", "elem_type", "shape"],
  typeNameAliases: {
    pt: "point",
    dot: "point",
    vertex: "point",
    node: "point",
    line: "segment",
    seg: "segment",
    edge: "segment",
    side: "segment",
    poly: "polygon",
    polyline: "polygon",
    circ: "circle",
    txt: "label",
    text: "label",
    annotation: "label",
    curve: "sampled_curve",
    sampledcurve: "sampled_curve",
    integral: "integral_region",
    region: "integral_region",
    box: "rect",
    rectangle: "rect",
    vector: "force",
  },
  structuralInfer: [
    {
      packs: ["math.function"],
      type: "sampled_curve",
      allKeys: ["expr"],
      anyKeyGroups: [["axes"], ["domain"]],
    },
    {
      packs: ["math.function"],
      type: "axes",
      anyKeyGroups: [["x", "y"]],
    },
    {
      packs: ["math.function"],
      type: "tangent",
      anyKeys: ["at_x", "slope"],
    },
    {
      packs: ["math.function"],
      type: "integral_region",
      anyKeys: ["area"],
    },
    {
      packs: ["physics.mechanics"],
      type: "force",
      allKeys: ["label"],
      anyKeyGroups: [["from", "to"]],
    },
    {
      packs: ["physics.mechanics"],
      type: "rect",
      anyKeyGroups: [
        ["width", "height"],
        ["w", "h"],
      ],
    },
    {
      packs: ["physics.mechanics"],
      type: "liquid",
      anyKeys: ["points"],
    },
    {
      packs: ["math.geometry", "physics.mechanics", "math.function", "*"],
      type: "label",
      allKeys: ["text"],
      anyKeys: ["at", "anchor"],
    },
    {
      packs: ["math.geometry", "physics.mechanics"],
      type: "circle",
      anyKeys: ["center", "r", "radius"],
    },
    {
      packs: ["math.geometry"],
      type: "grid",
      anyKeyGroups: [
        ["rows", "cols"],
        ["m", "n"],
      ],
    },
    {
      packs: ["math.geometry", "physics.mechanics"],
      type: "polygon",
      anyKeys: ["points", "vertices"],
    },
    {
      packs: ["math.geometry", "physics.mechanics"],
      type: "arrow",
      requireTypeNameHintPattern: "arrow|矢量|箭头",
      anyKeyGroups: [
        ["from", "to"],
        ["start", "end"],
      ],
    },
    {
      packs: ["math.geometry", "physics.mechanics"],
      type: "segment",
      anyKeyGroups: [
        ["from", "to"],
        ["start", "end"],
        ["a", "b"],
      ],
    },
    {
      packs: ["math.geometry", "physics.mechanics", "math.function", "*"],
      type: "point",
      allKeys: ["id"],
      anyKeyGroups: [["x", "y"], ["coordinates"], ["coords"], ["xy"], ["pos"]],
    },
    {
      packs: ["math.geometry", "physics.mechanics", "math.function", "*"],
      type: "point",
      anyKeyGroups: [["x", "y"], ["coordinates"], ["coords"], ["xy"]],
    },
  ],
};

function resolveHealConfig(): DiagramElementTypeHealConfig {
  const raw = (FIGURE_GENERATION as { elementTypeHeal?: DiagramElementTypeHealConfig })
    .elementTypeHeal;
  if (
    raw &&
    Array.isArray(raw.typeFieldAliases) &&
    raw.typeFieldAliases.length > 0 &&
    raw.typeNameAliases &&
    Array.isArray(raw.structuralInfer)
  ) {
    return raw;
  }
  return DEFAULT_ELEMENT_TYPE_HEAL;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeTypeToken(t: unknown): string {
  if (typeof t !== "string") return "";
  const m = t.trim().toLowerCase().match(/^[a-z_]+/);
  return m ? m[0]! : "";
}

function hasAllKeys(el: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((k) => el[k] !== undefined && el[k] !== null);
}

function hasAnyKey(el: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((k) => el[k] !== undefined && el[k] !== null);
}

function hasAnyKeyGroup(
  el: Record<string, unknown>,
  groups: ReadonlyArray<readonly string[]>,
): boolean {
  return groups.some((g) => hasAllKeys(el, g));
}

function packMatches(rulePacks: readonly string[], pack: string): boolean {
  if (rulePacks.includes("*")) return true;
  if (!pack) return rulePacks.includes("*");
  return rulePacks.includes(pack);
}

function resolveRawTypeToken(
  el: Record<string, unknown>,
  aliases: readonly string[],
): string {
  for (const key of aliases) {
    const token = normalizeTypeToken(el[key]);
    if (token) return token;
  }
  return "";
}

function applyTypeNameAlias(token: string, map: Record<string, string>): string {
  if (!token) return "";
  return map[token] ?? token;
}

function inferTypeFromStructure(
  el: Record<string, unknown>,
  pack: string,
  cfg: DiagramElementTypeHealConfig,
): string {
  const hintBlob = cfg.typeFieldAliases
    .map((k) => (typeof el[k] === "string" ? String(el[k]) : ""))
    .filter(Boolean)
    .join(" ");

  for (const rule of cfg.structuralInfer as ReadonlyArray<DiagramElementTypeStructuralInferRule>) {
    if (!packMatches(rule.packs, pack)) continue;
    if (rule.allKeys?.length && !hasAllKeys(el, rule.allKeys)) continue;
    if (rule.anyKeys?.length && !hasAnyKey(el, rule.anyKeys)) continue;
    if (rule.anyKeyGroups?.length && !hasAnyKeyGroup(el, rule.anyKeyGroups)) continue;
    if (rule.requireTypeNameHintPattern) {
      try {
        if (!new RegExp(rule.requireTypeNameHintPattern, "i").test(hintBlob)) continue;
      } catch {
        continue;
      }
    }
    return rule.type;
  }
  return "";
}

/**
 * 为 elements[] 补齐规范 `type` 字段（浅拷贝元素）。
 * 已有合法 type 时仅做同义名归一；无 type 时按字段别名 + 键形态推断。
 */
export function healDiagramElementTypes(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(raw.elements) || raw.elements.length === 0) return raw;
  const cfg = resolveHealConfig();
  const pack = typeof raw.pack === "string" ? raw.pack.trim() : "";
  let changed = false;
  const elements = raw.elements.map((item) => {
    if (!isRecord(item)) return item;
    const fromFields = applyTypeNameAlias(
      resolveRawTypeToken(item, cfg.typeFieldAliases),
      cfg.typeNameAliases,
    );
    const inferred = fromFields || inferTypeFromStructure(item, pack, cfg);
    if (!inferred) return item;
    const current = normalizeTypeToken(item.type);
    if (current === inferred && item.type === inferred) return item;
    changed = true;
    return { ...item, type: inferred };
  });
  return changed ? { ...raw, elements } : raw;
}
