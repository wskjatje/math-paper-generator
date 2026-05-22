/**
 * 浏览器端从常见办公文档抽取纯文本（PDF 文本层 / Word / Excel）。
 * 图片 OCR 仅经 Docker 网关 GOT-OCR 2.0（见 ImportOfflineExamDialog）。
 */
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|tif?f)$/i;

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  // SSR / Node：避免加载 pdf.mjs（会引用 DOMMatrix）；勿仅用 window 判断（部分环境会 polyfill）
  if (import.meta.env.SSR || typeof window === "undefined") {
    throw new Error("PDF 提取仅在浏览器环境可用");
  }
  const pdfjs = await import("pdfjs-dist");
  const { default: pdfWorkerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const chunk = content.items
      .map((it) => {
        if (
          it &&
          typeof it === "object" &&
          "str" in it &&
          typeof (it as { str: unknown }).str === "string"
        ) {
          return (it as { str: string }).str;
        }
        return "";
      })
      .join(" ");
    lines.push(chunk);
  }
  return lines.join("\n");
}

export type PdfPageJpeg = { page: number; dataUrl: string; mime: "image/jpeg" };

/**
 * 单次加载 PDF：抽取文本层 + 将每一页渲染为 JPEG（data URL），供导入流程写入 import-figures，
 * 使合并正文出现 `![](…)`，便于题干/选项引用扫描卷插图。
 */
export async function extractPdfTextAndRenderPagesAsJpeg(
  data: ArrayBuffer,
  options?: { maxPages?: number; maxSidePx?: number; jpegQuality?: number },
): Promise<{ text: string; pages: PdfPageJpeg[] }> {
  if (import.meta.env.SSR || typeof window === "undefined") {
    throw new Error("PDF 处理仅在浏览器环境可用");
  }
  const pdfjs = await import("pdfjs-dist");
  const { default: pdfWorkerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const total = pdf.numPages;
  const maxPages = Math.min(options?.maxPages ?? 35, total, 60);
  const maxSidePx = options?.maxSidePx ?? 1950;
  const jpegQuality = options?.jpegQuality ?? 0.83;

  const lines: string[] = [];
  const pages: PdfPageJpeg[] = [];

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const chunk = content.items
      .map((it) => {
        if (
          it &&
          typeof it === "object" &&
          "str" in it &&
          typeof (it as { str: unknown }).str === "string"
        ) {
          return (it as { str: string }).str;
        }
        return "";
      })
      .join(" ");
    lines.push(chunk);

    const baseVp = page.getViewport({ scale: 1 });
    const scale = Math.min(maxSidePx / Math.max(baseVp.width, baseVp.height, 1), 2.35);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const w = Math.max(1, Math.floor(viewport.width));
    const h = Math.max(1, Math.floor(viewport.height));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({
      page: p,
      dataUrl: canvas.toDataURL("image/jpeg", jpegQuality),
      mime: "image/jpeg",
    });
  }

  return { text: lines.join("\n"), pages };
}

export async function extractTextFromFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const ab = await file.arrayBuffer();

  if (lower.endsWith(".json") || lower.endsWith(".jsonl")) {
    throw new Error("本入口不支持选择 .json 文件，请使用 PDF、Word、Excel 或图片等格式");
  }

  if (lower.endsWith(".pdf")) {
    return extractPdfText(ab);
  }

  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.default.extractRawText({ arrayBuffer: ab });
    return result.value;
  }

  if (lower.endsWith(".doc")) {
    throw new Error("不支持旧版 .doc，请在 Word 中「另存为」.docx 后再导入");
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(ab, { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      parts.push(`--- 工作表 ${name} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
    }
    return parts.join("\n\n");
  }

  if (IMG_RE.test(lower)) {
    throw new Error(
      `${file.name}：图片请通过线下导入上传，由网关 GOT-OCR 2.0 识别（需 npm run docker:api:detach）`,
    );
  }

  throw new Error(`暂不支持的扩展名：${file.name}（支持 pdf、docx、xls/xlsx/csv）`);
}

export async function extractTextFromFiles(
  files: File[],
): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const blocks: string[] = [];

  for (const file of files) {
    try {
      const t = (await extractTextFromFile(file)).trim();
      if (!t)
        warnings.push(
          `${file.name}：未提取到文字（若是扫描版 PDF，可尝试导出为图片后单独上传做 OCR）`,
        );
      blocks.push(`\n\n<<< 文件: ${file.name} >>>\n\n${t}`);
    } catch (e: unknown) {
      warnings.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { text: blocks.join("\n"), warnings };
}
