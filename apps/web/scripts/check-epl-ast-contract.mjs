#!/usr/bin/env node
/**
 * EPL semantic anti-regression governance（P2.1 runtime contract）。
 *
 *   npm run governance:epl-ast-contract -w @zhixue/web
 *   npm run governance:epl-ast-contract -w @zhixue/web -- --strict
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORBIDDEN_PRESENTATION_APIS,
  FORBIDDEN_PRESENTATION_SCOPES,
} from "./epl-forbidden-apis.registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const ALLOW_TAG = "@epl-ast-contract-allow";
const strict = process.argv.includes("--strict");

async function* walkTsFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walkTsFiles(full);
    else if (/\.(tsx?|jsx?|mjs)$/.test(ent.name)) yield full;
  }
}

/** scope.dirs 可为目录或单文件（如 downloadExamPdf.ts） */
async function* walkScopeTargets(targetRel) {
  const abs = path.join(webRoot, targetRel);
  let st;
  try {
    st = await stat(abs);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (/\.(tsx?|jsx?|mjs)$/.test(abs)) yield abs;
    return;
  }
  yield* walkTsFiles(abs);
}

function lineAllowed(lines, lineIndex) {
  const line = lines[lineIndex] ?? "";
  if (line.includes(ALLOW_TAG)) return true;
  const prev = lines[lineIndex - 1] ?? "";
  return prev.includes(ALLOW_TAG);
}

function pathMatchesScope(relPath, scopeName) {
  const scope = FORBIDDEN_PRESENTATION_SCOPES[scopeName];
  if (!scope) return false;
  return scope.dirs.some((d) => relPath.startsWith(`${d}/`) || relPath === d);
}

async function scanScope(scopeName) {
  const scope = FORBIDDEN_PRESENTATION_SCOPES[scopeName];
  const findings = [];
  for (const dir of scope.dirs) {
    for await (const file of walkScopeTargets(dir)) {
      const rel = path.relative(webRoot, file);
      if (!pathMatchesScope(rel, scopeName)) continue;
      const text = await readFile(file, "utf8");
      const lines = text.split("\n");
      const rules = FORBIDDEN_PRESENTATION_APIS.filter((r) => r.scopes.includes(scopeName));

      for (const rule of rules) {
        const re = new RegExp(rule.pattern, rule.flags ?? "");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          if (!re.test(line)) continue;
          if (lineAllowed(lines, i)) continue;
          if (rule.excludePathRe && new RegExp(rule.excludePathRe).test(rel)) continue;
          findings.push({
            severity: rule.severity,
            file: rel,
            line: i + 1,
            id: rule.id,
            hint: rule.hint,
            rationale: rule.rationale,
            adr: rule.adr,
            replacement: rule.replacement,
            scope: scopeName,
          });
        }
      }
    }
  }
  return findings;
}

async function main() {
  const all = [];
  for (const scopeName of Object.keys(FORBIDDEN_PRESENTATION_SCOPES)) {
    all.push(...(await scanScope(scopeName)));
  }

  const errors = all.filter((f) => f.severity === "ERROR");
  const warns = all.filter((f) => f.severity === "WARN");
  const deprecated = all.filter((f) => f.severity === "DEPRECATED");

  const formatFinding = (f) =>
    [
      `  ${f.file}:${f.line} [${f.severity}] ${f.id}`,
      `    adr: ${f.adr} · rationale: ${f.rationale}`,
      `    do: ${f.replacement}`,
      `    ${f.hint}`,
    ].join("\n");

  if (deprecated.length > 0) {
    console.warn("EPL constitutional diagnostics — DEPRECATED:\n");
    for (const f of deprecated) console.warn(formatFinding(f));
    console.warn("");
  }

  if (warns.length > 0) {
    console.warn("EPL constitutional diagnostics — WARN:\n");
    for (const f of warns) console.warn(formatFinding(f));
    console.warn("");
  }

  if (errors.length > 0) {
    console.error("EPL constitutional diagnostics — ERROR:\n");
    for (const f of errors) console.error(formatFinding(f));
    process.exit(1);
  }

  const failOnWarn = strict && (warns.length > 0 || deprecated.length > 0);
  if (failOnWarn) {
    console.error("EPL contract: --strict failed on WARN/DEPRECATED");
    process.exit(1);
  }

  console.log(
    `EPL AST contract: OK (${FORBIDDEN_PRESENTATION_APIS.length} rules, ${Object.keys(FORBIDDEN_PRESENTATION_SCOPES).length} scopes)`,
  );
}

main();
