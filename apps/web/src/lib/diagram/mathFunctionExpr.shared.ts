/**
 * math.function 安全表达式子集：白名单递归下降，禁止 eval / new Function。
 * 允许：数字、变量、+ - * / ^、括号、sin cos tan exp log sqrt abs、pi e。
 */

export type CompileExprResult =
  | { ok: true; eval: (x: number) => number }
  | { ok: false; error: string };

const FN_ARITY1 = new Set(["sin", "cos", "tan", "exp", "log", "sqrt", "abs"]);

type Tok =
  | { k: "num"; v: number }
  | { k: "id"; v: string }
  | { k: "op"; v: string }
  | { k: "lp" }
  | { k: "rp" }
  | { k: "eof" };

function tokenize(src: string): Tok[] | string {
  const s = src.trim();
  if (!s) return "表达式为空";
  if (/[;=`'"\\]|function|=>|new\s|eval/i.test(s)) return "表达式含非法字符或关键字";
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d+(\.\d+)?([eE][+-]?\d+)?/);
      if (!m) return "数字格式错误";
      out.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = s.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (!m) return "标识符错误";
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/^".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ k: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ k: "rp" });
      i++;
      continue;
    }
    return `非法字符「${c}」`;
  }
  out.push({ k: "eof" });
  return out;
}

type Node =
  | { t: "num"; v: number }
  | { t: "var" }
  | { t: "const"; v: number }
  | { t: "un"; op: "-"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; name: string; a: Node };

function parseExpr(tokens: Tok[], variable: string): Node | string {
  let i = 0;
  const peek = () => tokens[i]!;
  const eat = () => tokens[i++]!;

  function parsePrimary(): Node | string {
    const t = peek();
    if (t.k === "num") {
      eat();
      return { t: "num", v: t.v };
    }
    if (t.k === "id") {
      eat();
      if (t.v === variable) return { t: "var" };
      if (t.v === "pi") return { t: "const", v: Math.PI };
      if (t.v === "e") return { t: "const", v: Math.E };
      if (FN_ARITY1.has(t.v)) {
        if (peek().k !== "lp") return `函数 ${t.v} 后需要 (`;
        eat();
        const arg = parseAdd();
        if (typeof arg === "string") return arg;
        if (peek().k !== "rp") return "缺少 )";
        eat();
        return { t: "call", name: t.v, a: arg };
      }
      return `未允许的标识符「${t.v}」（变量须为 ${variable}）`;
    }
    if (t.k === "lp") {
      eat();
      const inner = parseAdd();
      if (typeof inner === "string") return inner;
      if (peek().k !== "rp") return "缺少 )";
      eat();
      return inner;
    }
    return "期望数字、变量或 (";
  }

  // 标准优先级：^ 高于一元负号（-x^2 = -(x^2)），且 ^ 右结合、指数可带符号（x^-2）
  function parseUnary(): Node | string {
    if (peek().k === "op" && peek().v === "-") {
      eat();
      const a = parseUnary();
      if (typeof a === "string") return a;
      return { t: "un", op: "-", a };
    }
    if (peek().k === "op" && peek().v === "+") {
      eat();
      return parseUnary();
    }
    return parsePow();
  }

  function parsePow(): Node | string {
    const left = parsePrimary();
    if (typeof left === "string") return left;
    if (peek().k === "op" && peek().v === "^") {
      eat();
      const right = parseUnary(); // 经 unary 递归回 pow，保持右结合
      if (typeof right === "string") return right;
      return { t: "bin", op: "^", a: left, b: right };
    }
    return left;
  }

  function parseMul(): Node | string {
    let left = parseUnary();
    if (typeof left === "string") return left;
    while (peek().k === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = eat().v!;
      const right = parseUnary();
      if (typeof right === "string") return right;
      left = { t: "bin", op, a: left, b: right };
    }
    return left;
  }

  function parseAdd(): Node | string {
    let left = parseMul();
    if (typeof left === "string") return left;
    while (peek().k === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = eat().v!;
      const right = parseMul();
      if (typeof right === "string") return right;
      left = { t: "bin", op, a: left, b: right };
    }
    return left;
  }

  const ast = parseAdd();
  if (typeof ast === "string") return ast;
  if (peek().k !== "eof") return "表达式末尾有多余内容";
  return ast;
}

function evalNode(n: Node, x: number): number {
  switch (n.t) {
    case "num":
      return n.v;
    case "var":
      return x;
    case "const":
      return n.v;
    case "un":
      return -evalNode(n.a, x);
    case "bin": {
      const a = evalNode(n.a, x);
      const b = evalNode(n.b, x);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return a ** b;
        default:
          return NaN;
      }
    }
    case "call": {
      const a = evalNode(n.a, x);
      switch (n.name) {
        case "sin":
          return Math.sin(a);
        case "cos":
          return Math.cos(a);
        case "tan":
          return Math.tan(a);
        case "exp":
          return Math.exp(a);
        case "log":
          return Math.log(a);
        case "sqrt":
          return Math.sqrt(a);
        case "abs":
          return Math.abs(a);
        default:
          return NaN;
      }
    }
  }
}

/** 编译表达式；失败返回错误，不抛。 */
export function compileSafeExpr(expr: string, variable = "x"): CompileExprResult {
  const v = variable.trim() || "x";
  if (!/^[a-zA-Z_]\w*$/.test(v)) return { ok: false, error: "变量名非法" };
  const toks = tokenize(expr);
  if (typeof toks === "string") return { ok: false, error: toks };
  const ast = parseExpr(toks, v);
  if (typeof ast === "string") return { ok: false, error: ast };
  return {
    ok: true,
    eval: (x: number) => {
      if (!Number.isFinite(x)) return NaN;
      try {
        const y = evalNode(ast, x);
        return Number.isFinite(y) ? y : NaN;
      } catch {
        return NaN;
      }
    },
  };
}

export function validateSafeExpr(expr: string, variable = "x"): { ok: true } | { ok: false; error: string } {
  const c = compileSafeExpr(expr, variable);
  return c.ok ? { ok: true } : { ok: false, error: c.error };
}
