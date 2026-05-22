/**
 * 听力生成后写入 `public/audio/<examId>/...`，不会自动进入「构建时」的 dist。
 * `vite preview` / Electron 预览若只读 dist，会导致 `/audio/*` 404 或落到 SPA HTML，
 * `<audio>` 无法播放。本插件在 dev / preview 最前优先从磁盘 `public/audio` 返回 wav。
 */
import path from "node:path";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import type { Connect } from "vite";
import type { Plugin } from "vite";

/** 运行时听力音频：`apps/web/public/audio`（MPG_PROJECT_ROOT 为仓库根时向下解析） */
function resolvePublicAudioDir(): string {
  const env = process.env.MPG_PROJECT_ROOT?.trim();
  if (env) {
    const repo = path.resolve(env.trim());
    const nested = path.join(repo, "apps", "web", "public", "audio");
    if (existsSync(nested)) return nested;
    return path.join(repo, "public", "audio");
  }
  return path.join(process.cwd(), "public", "audio");
}

export function serveRuntimePublicAudio(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (req, res, next) => {
      try {
        const rawUrl = req.url?.split("?")[0] ?? "";
        if (!rawUrl.startsWith("/audio/")) {
          next();
          return;
        }
        const rel = decodeURIComponent(rawUrl.slice("/audio/".length));
        if (!rel || rel.includes("..")) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const baseAudio = path.resolve(resolvePublicAudioDir());
        const filePath = path.resolve(baseAudio, rel);
        if (!filePath.startsWith(baseAudio)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const buf = await fs.readFile(filePath);
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.end(buf);
      } catch (e: unknown) {
        const code = (e as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
          res.statusCode = 404;
          res.end();
          return;
        }
        next(e as Error);
      }
    });
  };

  return {
    name: "mpg-runtime-public-audio",
    enforce: "pre",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}
