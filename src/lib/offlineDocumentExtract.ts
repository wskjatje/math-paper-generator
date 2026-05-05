/**
 * 浏览器端从常见办公文档抽取纯文本，供「文档识别导入」走 AI 结构化。
 * 勿在服务端调用（依赖 pdf.js worker、tesseract 语言包等）。
 *
 * `routeTree.gen.ts` 会静态导入所有路由；调用方（如 ImportOfflineExamDialog）应对本模块使用动态 import，
 * 避免 SSR 阶段加载本文件；PDF 分支内仍对 pdfjs 使用动态 import，并在 extractPdfText 内用 import.meta.env.SSR 拦截。
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
        if (it && typeof it === "object" && "str" in it && typeof (it as { str: unknown }).str === "string") {
          return (it as { str: string }).str;
        }
        return "";
      })
      .join(" ");
    lines.push(chunk);
  }
  return lines.join("\n");
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
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(["chi_sim", "eng"]);
    try {
      const {
        data: { text },
      } = await worker.recognize(file);
      return text ?? "";
    } finally {
      await worker.terminate();
    }
  }

  throw new Error(`暂不支持的扩展名：${file.name}（支持 pdf、docx、xls/xlsx/csv、常见图片）`);
}

export async function extractTextFromFiles(files: File[]): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const blocks: string[] = [];

  for (const file of files) {
    try {
      const t = (await extractTextFromFile(file)).trim();
      if (!t) warnings.push(`${file.name}：未提取到文字（若是扫描版 PDF，可尝试导出为图片后单独上传做 OCR）`);
      blocks.push(`\n\n<<< 文件: ${file.name} >>>\n\n${t}`);
    } catch (e: unknown) {
      warnings.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { text: blocks.join("\n"), warnings };
}
