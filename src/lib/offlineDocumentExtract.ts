/**
 * 浏览器端从常见办公文档抽取纯文本，供「文档识别导入」走 AI 结构化。
 * 勿在服务端引用（依赖 pdf.js worker、tesseract 语言包等）。
 */
import * as pdfjs from "pdfjs-dist";
// vite 解析 worker 地址，避免 pdf.js 主线程报错
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|tif?f)$/i;

async function extractPdfText(data: ArrayBuffer): Promise<string> {
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
