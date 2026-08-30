/**
 * 运行时写入仓库根 `public/{audio,figures}` 的文件不会自动进入 apps/web 的 Vite publicDir。
 * 本插件按 {@link runtimePublicDirCandidates} 在多个候选目录中查找并返回文件。
 */
import path from "node:path";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import type { Connect } from "vite";
import type { Plugin } from "vite";
import {
  isRuntimePublicKind,
  runtimePublicDirCandidates,
  runtimePublicUrlPrefix,
  type RuntimePublicKind,
} from "../src/lib/runtimePublicAssets.shared";

function resolveRepoRoot(): string {
  const env = process.env.MPG_PROJECT_ROOT?.trim();
  if (env) {
    let dir = path.resolve(env);
    for (let i = 0; i < 25; i++) {
      if (existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "schemas", "v1"))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return path.resolve(env);
  }
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "schemas", "v1")) && existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }
  const up = path.resolve(cwd, "..", "..");
  if (existsSync(path.join(up, "schemas", "v1"))) return up;
  return cwd;
}

function contentTypeForRel(rel: string): string {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

async function tryReadRuntimePublicFile(
  kind: RuntimePublicKind,
  rel: string,
): Promise<Buffer | null> {
  const bases = runtimePublicDirCandidates(resolveRepoRoot(), kind);
  for (const base of bases) {
    const root = path.resolve(base);
    const filePath = path.resolve(root, rel);
    if (!filePath.startsWith(root)) continue;
    try {
      return await fs.readFile(filePath);
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") continue;
      throw e;
    }
  }
  return null;
}

function attachRuntimePublicMiddleware(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    try {
      const rawUrl = req.url?.split("?")[0] ?? "";
      const kindRaw = rawUrl.split("/").filter(Boolean)[0] ?? "";
      if (!isRuntimePublicKind(kindRaw)) {
        next();
        return;
      }
      const kind = kindRaw;
      const prefix = runtimePublicUrlPrefix(kind);
      if (!rawUrl.startsWith(prefix)) {
        next();
        return;
      }
      const rel = decodeURIComponent(rawUrl.slice(prefix.length));
      if (!rel || rel.includes("..")) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const buf = await tryReadRuntimePublicFile(kind, rel);
      if (!buf) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader("Content-Type", contentTypeForRel(rel));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.end(buf);
    } catch (e: unknown) {
      next(e as Error);
    }
  });
}

/** 兼容原导出名：现同时托管 audio 与 figures */
export function serveRuntimePublicAudio(): Plugin {
  return {
    name: "mpg-runtime-public-assets",
    enforce: "pre",
    configureServer(server) {
      attachRuntimePublicMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachRuntimePublicMiddleware(server.middlewares);
    },
  };
}
