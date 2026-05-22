#!/usr/bin/env node
/**
 * 开发环境自检：Node / npm、Docker 与 Compose、常用本地端口。
 * 用法：npm run doctor
 *   --strict  任一「建议项」不满足时退出码 1（默认仅 Node/npm 等必需项失败才非零）
 */
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const MIN_NODE_MAJOR = 18;

function argvHas(flag) {
  return process.argv.includes(flag);
}

function run(cmd, args, timeoutMs = 20_000) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0, code: r.status, out };
}

function parseNodeMajor() {
  const m = /^v(\d+)/.exec(process.version);
  return m ? Number(m[1]) : 0;
}

function probePort(host, port, ms = 900) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(ms, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function printSection(title) {
  console.log(`\n── ${title} ──`);
}

async function main() {
  const strict = argvHas("--strict");
  let failRequired = false;
  let failSuggested = false;

  console.log("=== 知学 Math Paper Generator · 开发环境检查 ===\n");

  printSection("运行时");
  const nodeMajor = parseNodeMajor();
  if (nodeMajor >= MIN_NODE_MAJOR) {
    console.log(`✓ Node.js ${process.version}（建议 ≥ ${MIN_NODE_MAJOR}）`);
  } else {
    console.log(`✗ Node.js ${process.version} — 需要 ≥ v${MIN_NODE_MAJOR}.x，请升级 Node（推荐 nvm / fnm / 官网 LTS）`);
    failRequired = true;
  }

  const npm = run("npm", ["--version"], 10_000);
  if (npm.ok) {
    console.log(`✓ npm ${npm.out.split(/\s+/)[0]}`);
  } else {
    console.log("✗ 未检测到 npm（请安装 Node 官方发行版或包管理器自带的 npm）");
    failRequired = true;
  }

  printSection("Docker（网关 / OCR 等本地栈）");
  const dockerVer = run("docker", ["--version"], 12_000);
  if (dockerVer.ok && dockerVer.out) {
    console.log(`✓ Docker CLI（${dockerVer.out.split("\n")[0]}）`);
  } else {
    console.log("△ 未找到 docker 命令 — 仅前端开发可跳过；网关/OCR/本地栈需安装 Docker（见 docs/architecture/stack-docker.md）");
    failSuggested = true;
  }

  const dockerInfo = run("docker", ["info"], 15_000);
  if (dockerInfo.ok) {
    console.log("✓ Docker 守护进程已运行");
  } else {
    console.log("△ Docker 守护进程未就绪 — 请启动 Docker Desktop，或运行 npm run docker:ensure（macOS 可尝试自动拉起）");
    failSuggested = true;
  }

  const compose = run("docker", ["compose", "version"], 12_000);
  if (compose.ok) {
    const line = compose.out.split("\n")[0] || compose.out;
    console.log(`✓ docker compose（${line.slice(0, 80)}${line.length > 80 ? "…" : ""}）`);
  } else {
    const legacy = run("docker-compose", ["--version"], 12_000);
    if (legacy.ok) {
      console.log(`△ docker-compose（独立命令）可用；建议改用 Docker Compose V2 插件：docker compose`);
    } else {
      console.log("✗ 未检测到「docker compose」或 docker-compose — 无法使用 infrastructure/docker/docker-compose.yml 一键栈");
      failSuggested = true;
    }
  }

  printSection("可选 · 本地端口（未监听通常可忽略）");
  const pgUp = await probePort("127.0.0.1", 5432);
  const gwUp = await probePort("127.0.0.1", 8090);
  if (pgUp) {
    console.log("○ 127.0.0.1:5432 可连接（常见于 compose 内 Postgres）");
  } else {
    console.log("○ 127.0.0.1:5432 未监听 — 若不用 Docker 版数据库可忽略；云端题库见 .env.example 中 Supabase");
  }
  if (gwUp) {
    console.log("○ 127.0.0.1:8090 可连接（API 网关）");
  } else {
    console.log("○ 127.0.0.1:8090 未监听 — 需要网关 OCR 时执行：npm run docker:stack:detach");
  }

  printSection("配置文件");
  const envExample = path.join(REPO_ROOT, ".env.example");
  const envLocal = path.join(REPO_ROOT, ".env");
  if (existsSync(envExample)) {
    console.log("✓ 仓库含 .env.example（复制为 .env 并按需填写）");
  }
  if (existsSync(envLocal)) {
    console.log("✓ 已存在本机 .env");
  } else {
    console.log("△ 尚无 .env — 可选复制 .env.example；不配置也能本地预览/demo（AGENTS.md）");
  }

  console.log("\n── 参考 ──");
  console.log("· 全栈 Docker：npm run docker:stack 或 docker:stack:detach");
  console.log("· 本机 :8080 + OCR 网关：npm run dev:host（docker:api:detach，不构建 web 镜像；Vite 代理 /api/v1 → :8090）");
  console.log("· 仅前端：配置允许时可 SKIP_DOCKER_ENSURE=1 npm run dev（跳过 Docker 检测）");
  console.log("· 跳过首次自检：touch .zhixue-env-ok 或设 SKIP_FIRST_RUN_ENV=1");

  const code =
    failRequired ? 1 : strict && failSuggested ? 1 : 0;
  if (code !== 0) {
    console.log("\n（存在未就绪项，请按上文补齐后重试。）");
  }
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
