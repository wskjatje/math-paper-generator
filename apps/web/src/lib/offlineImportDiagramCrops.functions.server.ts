/**
 * 按 bbox 从已落盘的整页 import-figures 原图裁剪单题示意图；
 * 按「页码 + 题号」存入 `import-figures/<batch>/questions/`，并维护 `question-figures.json` 清单。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import sharp from "sharp";
import { z } from "zod";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

const CropSchema = z.object({
  batchId: z.string().uuid(),
  /** 对应 persistOfflineImportFigures 写入的 `0.png` / `0.jpg` 下标 */
  imageIndex: z.number().int().min(0).max(64),
  /** 原图扩展名，不含点 */
  sourceExt: z.enum(["png", "jpg", "jpeg", "webp", "gif"]),
  items: z
    .array(
      z.object({
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        slug: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-zA-Z0-9_-]+$/),
        /** 题号；无题号对齐时为 null */
        questionIndex: z.union([z.number().int().min(0).max(999), z.null()]).optional(),
      }),
    )
    .min(1)
    .max(64),
});

export type QuestionFiguresManifest = {
  version: 1;
  batch_id: string;
  updated_at: string;
  items: Array<{
    page_index: number;
    question_index: number | null;
    slug: string;
    url: string;
    bbox: [number, number, number, number];
    /** 本页原图文件，如 0.jpg */
    source_page_file: string;
  }>;
};

function toPixelRect(
  bbox: [number, number, number, number],
  iw: number,
  ih: number,
): { left: number; top: number; width: number; height: number } {
  const [a, b, c, d] = bbox;
  const looksNorm = [a, b, c, d].every((n) => n >= 0 && n <= 1.0001);
  if (looksNorm && iw > 0 && ih > 0) {
    const x = Math.round(a * iw);
    const y = Math.round(b * ih);
    const w = Math.round(c * iw);
    const h = Math.round(d * ih);
    return clampRect(x, y, w, h, iw, ih);
  }
  const x = Math.round(a);
  const y = Math.round(b);
  const w = Math.round(c);
  const h = Math.round(d);
  let r = clampRect(x, y, w, h, iw, ih);
  /** 部分网关返回 [x1,y1,x2,y2] 而非 xywh */
  if ((r.width <= 2 || r.height <= 2 || r.width > iw || r.height > ih) && c > a && d > b) {
    const w2 = Math.round(c - a);
    const h2 = Math.round(d - b);
    if (w2 >= 2 && h2 >= 2) r = clampRect(x, y, w2, h2, iw, ih);
  }
  return r;
}

function clampRect(
  left: number,
  top: number,
  width: number,
  height: number,
  iw: number,
  ih: number,
): { left: number; top: number; width: number; height: number } {
  const l = Math.max(0, Math.min(left, Math.max(0, iw - 1)));
  const t = Math.max(0, Math.min(top, Math.max(0, ih - 1)));
  let w = Math.max(1, width);
  let h = Math.max(1, height);
  if (l + w > iw) w = Math.max(1, iw - l);
  if (t + h > ih) h = Math.max(1, ih - t);
  return { left: l, top: t, width: w, height: h };
}

async function mergeQuestionFiguresManifest(
  relDirFs: string,
  batchId: string,
  imageIndex: number,
  newEntries: QuestionFiguresManifest["items"],
): Promise<void> {
  const manifestPath = path.join(resolveProjectRoot(), relDirFs, "question-figures.json");
  const manifest: QuestionFiguresManifest = {
    version: 1,
    batch_id: batchId,
    updated_at: new Date().toISOString(),
    items: [],
  };
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as QuestionFiguresManifest;
    if (parsed?.version === 1 && Array.isArray(parsed.items)) {
      /** 同一扫描页重跑时替换该页条目 */
      manifest.items = parsed.items.filter((it) => it.page_index !== imageIndex);
    }
  } catch {
    /* 首次创建 */
  }

  manifest.items.push(...newEntries);
  manifest.items.sort((a, b) => {
    if (a.page_index !== b.page_index) return a.page_index - b.page_index;
    const aq = a.question_index ?? 10000;
    const bq = b.question_index ?? 10000;
    return aq - bq || a.slug.localeCompare(b.slug);
  });
  manifest.updated_at = new Date().toISOString();
  manifest.batch_id = batchId;

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export const persistOfflineImportDiagramCrops = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CropSchema.parse(data))
  .handler(async ({ data }) => {
    const { batchId, imageIndex, sourceExt, items } = data;
    const ext = sourceExt === "jpeg" ? "jpg" : sourceExt;
    const relDirFs = path.join("apps", "web", "public", "import-figures", batchId);
    const localPath = path.join(resolveProjectRoot(), relDirFs, `${imageIndex}.${ext}`);

    const buf = await readFile(localPath);
    const meta = await sharp(buf).metadata();
    const iw = meta.width ?? 0;
    const ih = meta.height ?? 0;
    if (iw < 2 || ih < 2) {
      throw new Error("原图尺寸无效，无法裁剪");
    }

    const urls: Record<string, string> = {};
    const bucket = process.env.MPG_IMPORT_FIGURES_BUCKET?.trim();
    const supa = getSupabaseAdmin();

    const manifestAppend: QuestionFiguresManifest["items"] = [];
    const questionsDirFs = path.join(resolveProjectRoot(), relDirFs, "questions");
    await mkdir(questionsDirFs, { recursive: true });

    for (const it of items) {
      const { left, top, width, height } = toPixelRect(it.bbox, iw, ih);
      if (width < 2 || height < 2) continue;

      const cropBuf = await sharp(buf).extract({ left, top, width, height }).png().toBuffer();

      const fileName = `${it.slug}.png`;
      const objectPath = `offline-import/${batchId}/questions/${fileName}`;
      let url: string | null = null;

      if (supa && bucket) {
        try {
          const { error: upErr } = await supa.storage.from(bucket).upload(objectPath, cropBuf, {
            contentType: "image/png",
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
        await writeFile(path.join(questionsDirFs, fileName), cropBuf);
        url = `/import-figures/${batchId}/questions/${fileName}`;
      }

      urls[it.slug] = url;
      manifestAppend.push({
        page_index: imageIndex,
        question_index: it.questionIndex ?? null,
        slug: it.slug,
        url,
        bbox: it.bbox,
        source_page_file: `${imageIndex}.${ext}`,
      });
    }

    if (manifestAppend.length > 0) {
      await mergeQuestionFiguresManifest(relDirFs, batchId, imageIndex, manifestAppend);
    }

    const manifestPublicUrl = `/import-figures/${batchId}/question-figures.json`;

    return { urls, manifestUrl: manifestPublicUrl };
  });
