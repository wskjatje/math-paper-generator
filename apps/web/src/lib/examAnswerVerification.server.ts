/**
 * 服务端答案验算（零额外依赖）：
 * - 多问：题干含（1）…（n）连续编号时，answer 须逐问标注，缺一不可。
 * - 数值：二元一次方程组、一元一次、一元二次（可解析且非多问混杂时）代入验算。
 * - knowledge_tags 命中对应知识点时，强制题干/答案可解析。
 */

export interface ParsedAiQuestionLike {
  type: string;
  content: string;
  answer: string;
  knowledge_tags?: unknown;
}

const LINEAR_SYS_EPS = 1e-4;
const SUBST_TOLERANCE = 1e-2;

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map((x) => String(x)).filter(Boolean);
}

function isNumericVerifyQuestionType(t: string): boolean {
  return t === "calculation" || t === "fill_blank" || t === "short_answer";
}

/** 含可客观验算方程的题型（含证明题、交叉学科中的计算） */
function isEquationCarryingType(t: string): boolean {
  if (isNumericVerifyQuestionType(t)) return true;
  if (t === "proof" || t.startsWith("cross_")) return true;
  return false;
}

/** 题干 / 答案中的「第 k 问」编号（半角 / 全角括号） */
function collectOrderedQuestionMarkers(content: string): number[] {
  const found = new Set<number>();
  const patterns = [/（\s*(\d+)\s*）/g, /\(\s*(\d+)\s*\)/g, /第\s*(\d+)\s*[问小]/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(content)) !== null) {
      const n = Number.parseInt(m[1], 10);
      if (n >= 1 && n <= 40) found.add(n);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** 从 1 起连续编至 n（题干须同时含 1…n）；否则返回 0（不启用多问闸门） */
function maxContiguousQuestionIndex(indices: number[]): number {
  if (indices.length === 0) return 0;
  const set = new Set(indices);
  const M = Math.max(...indices);
  for (let i = 1; i <= M; i++) {
    if (!set.has(i)) return 0;
  }
  return M;
}

function stemMultiPartDegree(content: string): number {
  return maxContiguousQuestionIndex(collectOrderedQuestionMarkers(content));
}

function answerCoversQuestionMarkers(answer: string, n: number): boolean {
  const found = new Set<number>();
  const patterns = [/（\s*(\d+)\s*）/g, /\(\s*(\d+)\s*\)/g, /第\s*(\d+)\s*[问小]/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(answer)) !== null) {
      const k = Number.parseInt(m[1], 10);
      if (k >= 1 && k <= n) found.add(k);
    }
  }
  for (let i = 1; i <= n; i++) {
    if (!found.has(i)) return false;
  }
  return true;
}

function isMultiPartApplicableType(t: string): boolean {
  return (
    t === "calculation" ||
    t === "fill_blank" ||
    t === "short_answer" ||
    t === "proof" ||
    t === "programming" ||
    t.startsWith("cross_")
  );
}

/**
 * 题干若含连续（1）～（n）（n≥2），answer 必须带齐各问标记。
 */
function verifyMultiPartAnswerCompleteness(q: ParsedAiQuestionLike, questionIndex: number): string | undefined {
  if (!isMultiPartApplicableType(String(q.type ?? ""))) return undefined;
  const content = String(q.content ?? "");
  const answer = String(q.answer ?? "");
  const n = stemMultiPartDegree(content);
  if (n < 2) return undefined;
  if (answerCoversQuestionMarkers(answer, n)) return undefined;
  return `第 ${questionIndex} 题：题干含（1）至（${n}）等多问，answer 须按（1）（2）…逐问给出结论（可与题干同编号格式），缺一不可；禁止只写最后一问答案。`;
}

function shouldSkipSingleEquationNumericDueToMultiPartStem(content: string): boolean {
  return stemMultiPartDegree(content) >= 2;
}

export function stripTexNoiseForEqParse(s: string): string {
  return s
    .replace(/\$\$?/g, " ")
    .replace(/\\begin\{cases\}/gi, " ")
    .replace(/\\end\{cases\}/gi, " ")
    .replace(/\\\(|\\\)/g, " ")
    .replace(/\\\\/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCoeffToken(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (t === "" || t === "+") return 1;
  if (t === "-") return -1;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** 解析左侧 ax+by（字符串已无空格） */
function parseXYLeft(leftNoSpace: string): { a: number; b: number } | undefined {
  let s = leftNoSpace;
  if (s.startsWith("x")) s = `1${s}`;
  else if (s.startsWith("-x")) s = `-1${s.slice(2)}`;
  else if (s.startsWith("+x")) s = `1${s.slice(2)}`;

  const xm = s.match(/([+-]?\d*\.?\d*)x/i);
  const ym = s.match(/([+-]?\d*\.?\d*)y/i);
  if (!xm || !ym) return undefined;
  const ca = parseCoeffToken(xm[1]);
  const cb = parseCoeffToken(ym[1]);
  if (ca === undefined || cb === undefined) return undefined;
  return { a: ca, b: cb };
}

function parseOneLinearEq2Var(line: string): { a: number; b: number; c: number } | undefined {
  const t = line.replace(/\s/g, "");
  if (!t.includes("=") || !t.includes("x") || !t.includes("y")) return undefined;
  const eq = t.indexOf("=");
  const left = t.slice(0, eq);
  const right = t.slice(eq + 1).replace(/[,，].*$/, "");
  const c = Number(right);
  if (!Number.isFinite(c)) return undefined;
  const ab = parseXYLeft(left);
  if (!ab) return undefined;
  return { a: ab.a, b: ab.b, c };
}

/** 左侧 ax+b（一元，字符串已无空格） */
function parseLinearLeftAxPlusB(leftNoSpace: string): { a: number; b: number } | undefined {
  let s = leftNoSpace;
  if (s.startsWith("x")) s = `1${s}`;
  else if (s.startsWith("-x")) s = `-1${s.slice(2)}`;
  else if (s.startsWith("+x")) s = `1${s.slice(2)}`;

  const m1 = s.match(/^([+-]?\d*\.?\d*)x([+-]\d+\.?\d*)?$/i);
  if (m1) {
    const a = parseCoeffToken(m1[1]);
    const b = m1[2] ? Number(m1[2]) : 0;
    if (a === undefined || !Number.isFinite(b)) return undefined;
    return { a, b };
  }
  const m2 = s.match(/^(\d+\.?\d*)-x([+-]\d+\.?\d*)?$/i);
  if (m2) {
    const c0 = Number(m2[1]);
    const tail = m2[2] ? Number(m2[2]) : 0;
    if (!Number.isFinite(c0) || !Number.isFinite(tail)) return undefined;
    return { a: -1, b: c0 + tail };
  }
  return undefined;
}

function parseOneLinearEq1Var(line: string): { a: number; b: number; c: number } | undefined {
  const t = line.replace(/\s/g, "");
  if (/x²|x\^2/i.test(t)) return undefined;
  if (!t.includes("=") || !t.includes("x") || t.includes("y")) return undefined;
  const eq = t.indexOf("=");
  const left = t.slice(0, eq);
  const right = t.slice(eq + 1).replace(/[,，].*$/, "");
  const c = Number(right);
  if (!Number.isFinite(c)) return undefined;
  const ab = parseLinearLeftAxPlusB(left);
  if (!ab) return undefined;
  return { a: ab.a, b: ab.b, c };
}

/** 从题干中提取两条二元一次方程（含 LaTeX cases） */
export function collectTwoLinearEquations(
  content: string,
): [{ a: number; b: number; c: number }, { a: number; b: number; c: number }] | undefined {
  const blob = stripTexNoiseForEqParse(content);
  const lines = blob.split(/\n/).flatMap((l) => l.split(";")).map((l) => l.trim()).filter(Boolean);
  const out: Array<{ a: number; b: number; c: number }> = [];
  for (const line of lines) {
    const p = parseOneLinearEq2Var(line);
    if (p) {
      out.push(p);
      if (out.length >= 2) {
        return [out[0], out[1]];
      }
    }
  }
  return undefined;
}

function solveLinearSystem2x2(
  e1: { a: number; b: number; c: number },
  e2: { a: number; b: number; c: number },
): { x: number; y: number } | undefined {
  const det = e1.a * e2.b - e2.a * e1.b;
  if (Math.abs(det) < 1e-9) return undefined;
  const x = (e1.c * e2.b - e2.c * e1.b) / det;
  const y = (e1.a * e2.c - e2.a * e1.c) / det;
  return { x, y };
}

export function parseXYPairFromAnswer(answer: string): { x: number; y: number } | undefined {
  const flat = answer.replace(/\$/g, "").replace(/\s/g, "");
  const xm = flat.match(/x\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  const ym = flat.match(/y\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!xm || !ym) {
    const paren = flat.match(/\(?([+-]?\d+(?:\.\d+)?)[,，]([+-]?\d+(?:\.\d+)?)\)?/);
    if (!paren) return undefined;
    const x = Number(paren[1]);
    const y = Number(paren[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x, y };
  }
  const x = Number(xm[1]);
  const y = Number(ym[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

function formatNumHint(n: number): string {
  const r = Math.round(n);
  if (Math.abs(n - r) < LINEAR_SYS_EPS) return String(r);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function parseXFromAnswer(answer: string): number | undefined {
  const flat = answer.replace(/\$/g, "").replace(/\s/g, "");
  const m = flat.match(/x\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const x = Number(m[1]);
  return Number.isFinite(x) ? x : undefined;
}

/** 纯数字最终答案（填空常见） */
function parseXFromAnswerLoose(answer: string): number | undefined {
  const fromX = parseXFromAnswer(answer);
  if (fromX !== undefined) return fromX;
  const flat = answer.replace(/\$/g, "").trim();
  const m = flat.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  const x = Number(m[1]);
  return Number.isFinite(x) ? x : undefined;
}

function parseQuadraticLeftSide(left: string): { a: number; b: number; c: number } | undefined {
  let s = left.replace(/\s/g, "").replace(/\^2/gi, "²");
  if (!/x²|x\^2/i.test(s)) return undefined;
  let a = 1;
  const mA = s.match(/^([+-]?\d*\.?\d*)x(\^2|²)/i);
  if (mA) {
    const ca = parseCoeffToken(mA[1]);
    if (ca === undefined) return undefined;
    a = ca;
    s = s.slice(mA[0].length);
  } else if (/^x(\^2|²)/i.test(s)) {
    s = s.replace(/^x(\^2|²)/i, "");
  } else if (/^-x(\^2|²)/i.test(s)) {
    a = -1;
    s = s.replace(/^-x(\^2|²)/i, "");
  } else {
    return undefined;
  }
  s = s.replace(/^\+/, "");
  let b = 0;
  let c = 0;
  const mB = s.match(/^([+-]?\d*\.?\d*)x(?!\^|²)/i);
  if (mB) {
    const cb = parseCoeffToken(mB[1]);
    if (cb === undefined) return undefined;
    b = cb;
    s = s.slice(mB[0].length);
  }
  s = s.replace(/^\+/, "");
  if (s) {
    const cn = Number(s);
    if (!Number.isFinite(cn)) return undefined;
    c = cn;
  }
  return { a, b, c };
}

/** 化为一元二次标准式 ax²+bx+c=0 的系数（a≠0） */
function parseQuadraticToStandard(line: string): { a: number; b: number; c: number } | undefined {
  let t = line.replace(/\s/g, "").replace(/\^2/gi, "²");
  if (!/x²|x\^2/i.test(t) || !t.includes("=")) return undefined;
  const eq = t.indexOf("=");
  const left = t.slice(0, eq);
  const rhsStr = t.slice(eq + 1).replace(/[,，].*$/, "");
  const rhs = Number(rhsStr);
  if (!Number.isFinite(rhs)) return undefined;
  const leftPoly = parseQuadraticLeftSide(left);
  if (!leftPoly) return undefined;
  return { a: leftPoly.a, b: leftPoly.b, c: leftPoly.c - rhs };
}

function collectFirstQuadraticEquation(content: string): { a: number; b: number; c: number } | undefined {
  if (collectTwoLinearEquations(content)) return undefined;
  const blob = stripTexNoiseForEqParse(content);
  const lines = blob.split(/\n/).flatMap((l) => l.split(";")).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const p = parseQuadraticToStandard(line);
    if (p && Math.abs(p.a) > 1e-12) return p;
  }
  return undefined;
}

function solveQuadraticRealRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) return [];
  const D = b * b - 4 * a * c;
  if (D < -1e-5) return [];
  if (Math.abs(D) < 1e-7) return [-b / (2 * a)];
  const s = Math.sqrt(D);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
}

function parseTwoRealRootsFromAnswer(answer: string): [number, number] | [number] | undefined {
  const flat = answer.replace(/\$/g, "");
  const xs = [...flat.matchAll(/x\s*[=＝]\s*([+-]?\d+(?:\.\d+)?)/gi)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  if (xs.length >= 2) return [xs[0], xs[1]];
  if (xs.length === 1) return [xs[0]];
  const pair = flat.match(
    /([+-]?\d+(?:\.\d+)?)\s*[,，、或]\s*([+-]?\d+(?:\.\d+)?)/,
  );
  if (pair) return [Number(pair[1]), Number(pair[2])];
  return undefined;
}

function sameRealRootsWithinTol(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < sa.length; i++) {
    if (Math.abs(sa[i] - sb[i]) > SUBST_TOLERANCE) return false;
  }
  return true;
}

/** 重根时允许 answer 只写一个根或写两个相同根 */
function quadraticRootsMatch(ref: number[], ans: number[]): boolean {
  if (ref.length === 0) return false;
  if (ref.length === 1) {
    const r = ref[0];
    if (ans.length === 1) return Math.abs(ans[0] - r) <= SUBST_TOLERANCE;
    if (ans.length === 2) {
      return (
        Math.abs(ans[0] - r) <= SUBST_TOLERANCE && Math.abs(ans[1] - r) <= SUBST_TOLERANCE
      );
    }
    return false;
  }
  return ans.length === 2 && sameRealRootsWithinTol(ref, ans);
}

function collectFirstUnaryLinearEquation(content: string): { a: number; b: number; c: number } | undefined {
  if (collectTwoLinearEquations(content)) return undefined;
  const blob = stripTexNoiseForEqParse(content);
  const lines = blob.split(/\n/).flatMap((l) => l.split(";")).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (parseQuadraticToStandard(line)) continue;
    const p = parseOneLinearEq1Var(line);
    if (p) return p;
  }
  return undefined;
}

/**
 * 若题干可解析为标准二元一次方程组且 answer 含 x、y 数值，则数值校验；失败则拒绝入库。
 */
function verifyBinaryLinearSystemAnswer(q: ParsedAiQuestionLike, questionIndex: number): string | undefined {
  if (!isEquationCarryingType(String(q.type ?? ""))) return undefined;
  const content = String(q.content ?? "");
  if (shouldSkipSingleEquationNumericDueToMultiPartStem(content)) return undefined;
  const pairEqs = collectTwoLinearEquations(content);
  if (!pairEqs) return undefined;
  const [e1, e2] = pairEqs;
  const xyAns = parseXYPairFromAnswer(String(q.answer ?? ""));
  if (!xyAns) return undefined;
  const solved = solveLinearSystem2x2(e1, e2);
  if (!solved) return undefined;

  for (const e of [e1, e2]) {
    if (Math.abs(e.a * xyAns.x + e.b * xyAns.y - e.c) > SUBST_TOLERANCE) {
      return `第 ${questionIndex} 题：方程组答案与题干矛盾（代入原方程不成立）。本题正确解约为 x=${formatNumHint(solved.x)}, y=${formatNumHint(solved.y)}。请重新生成；命题提示已要求「每道方程都要验算」。`;
    }
  }
  return undefined;
}

/**
 * 若题干可解析为一元一次方程且答案为数字，则验算 ax+b=c。
 */
function verifyUnaryLinearEquationAnswer(q: ParsedAiQuestionLike, questionIndex: number): string | undefined {
  if (!isEquationCarryingType(String(q.type ?? ""))) return undefined;
  const content = String(q.content ?? "");
  if (shouldSkipSingleEquationNumericDueToMultiPartStem(content)) return undefined;
  if (collectTwoLinearEquations(content)) return undefined;
  if (collectFirstQuadraticEquation(content)) return undefined;
  const eq = collectFirstUnaryLinearEquation(content);
  if (!eq) return undefined;
  if (Math.abs(eq.a) < 1e-12) return undefined;
  const xAns = parseXFromAnswerLoose(String(q.answer ?? ""));
  if (xAns === undefined) return undefined;
  const lhs = eq.a * xAns + eq.b;
  if (Math.abs(lhs - eq.c) <= SUBST_TOLERANCE) return undefined;
  const xSolved = (eq.c - eq.b) / eq.a;
  return `第 ${questionIndex} 题：一元一次方程答案与题干矛盾（代入不成立）。正确解约为 x=${formatNumHint(xSolved)}。请重新生成。`;
}

/**
 * 一元二次方程：题干可解析为 ax²+bx+c=0 且答案给出实根时验算（复根或_delta<0 跳过）。
 */
function verifyQuadraticEquationAnswer(q: ParsedAiQuestionLike, questionIndex: number): string | undefined {
  if (!isEquationCarryingType(String(q.type ?? ""))) return undefined;
  const content = String(q.content ?? "");
  if (shouldSkipSingleEquationNumericDueToMultiPartStem(content)) return undefined;
  const poly = collectFirstQuadraticEquation(content);
  if (!poly) return undefined;
  const rootsAns = parseTwoRealRootsFromAnswer(String(q.answer ?? ""));
  if (!rootsAns) return undefined;
  const ref = solveQuadraticRealRoots(poly.a, poly.b, poly.c);
  if (ref.length === 0) return undefined;
  if (!quadraticRootsMatch(ref, [...rootsAns])) {
    const hint = ref.map((r) => formatNumHint(r)).join("、");
    return `第 ${questionIndex} 题：一元二次方程答案与题干矛盾（根不匹配）。本题实根约为 ${hint}。请重新生成并验算。`;
  }
  return undefined;
}

/**
 * 以下「标签闸门」已停用：应用题/文字叙述类方程题往往无法被简易正则解析为 ax+b=c，
 * 会造成误杀。保留 verify* 系列：仅在题干**已能解析**为方程时做数值验算。
 */

/**
 * 按顺序执行全部数值/标签验算，返回零条或多条错误信息。
 */
export function verifyParsedQuestionAnswerErrors(
  q: ParsedAiQuestionLike,
  questionIndex: number,
): string[] {
  const errs: string[] = [];
  const mp = verifyMultiPartAnswerCompleteness(q, questionIndex);
  if (mp) errs.push(mp);
  const a = verifyBinaryLinearSystemAnswer(q, questionIndex);
  if (a) errs.push(a);
  const qe = verifyQuadraticEquationAnswer(q, questionIndex);
  if (qe) errs.push(qe);
  const c = verifyUnaryLinearEquationAnswer(q, questionIndex);
  if (c) errs.push(c);
  return errs;
}
