import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

const PersistSchema = z.object({
  batchId: z.string().uuid(),
  items: z
    .array(
      z.object({
        base64: z.string().min(1),
        mime: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(40),
});

function extFromMime(m: string): string | null {
  const x = m.toLowerCase();
  if (x.includes("png")) return "png";
  if (x.includes("jpeg") || x.includes("jpg")) return "jpg";
  if (x.includes("webp")) return "webp";
  if (x.includes("gif")) return "gif";
  return null;
}

function stripDataUrlBase64(s: string): string {
  const i = s.indexOf("base64,");
  if (i >= 0) return s.slice(i + 7).replace(/\s/g, "");
  return s.replace(/\s/g, "");
}

/**
 * 将线下导入的扫描件保存为可访问 URL：
 * - 若配置 `MPG_IMPORT_FIGURES_BUCKET` 且 Supabase 可用，则上传到 Storage（须为可匿名读的桶），返回公开 URL；
 * - 否则落盘 `apps/web/public/import-figures/<batchId>/`，返回 `/import-figures/...`。
 */
export const persistOfflineImportFigures = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PersistSchema.parse(data))
  .handler(async ({ data }) => {
    const urls: string[] = [];
    const bucket = process.env.MPG_IMPORT_FIGURES_BUCKET?.trim();
    const supa = getSupabaseAdmin();

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]!;
      const ext = extFromMime(item.mime);
      if (!ext) {
        throw new Error(`不支持的图片类型：${item.mime}`);
      }
      const b64 = stripDataUrlBase64(item.base64);
      const buf = Buffer.from(b64, "base64");
      if (buf.length < 8) {
        throw new Error("图片数据过短，可能已损坏");
      }
      if (buf.length > 15 * 1024 * 1024) {
        throw new Error("单张图片超过 15MB 上限");
      }

      const objectPath = `offline-import/${data.batchId}/${i}.${ext}`;
      let url: string | null = null;

      if (supa && bucket) {
        try {
          const { error: upErr } = await supa.storage.from(bucket).upload(objectPath, buf, {
            contentType: item.mime?.trim() || `image/${ext === "jpg" ? "jpeg" : ext}`,
            upsert: true,
          });
          if (!upErr) {
            const { data: pub } = supa.storage.from(bucket).getPublicUrl(objectPath);
            if (pub?.publicUrl) url = pub.publicUrl;
          }
        } catch {
          /* 回落本地 */
        }
      }

      if (!url) {
        const outDir = path.join(
          resolveProjectRoot(),
          "apps",
          "web",
          "public",
          "import-figures",
          data.batchId,
        );
        await mkdir(outDir, { recursive: true });
        await writeFile(path.join(outDir, `${i}.${ext}`), buf);
        url = `/import-figures/${data.batchId}/${i}.${ext}`;
      }

      urls.push(url);
    }

    const storage = urls.every((u) => /^https?:\/\//i.test(u))
      ? ("supabase" as const)
      : ("local" as const);

    return { urls, storage };
  });
