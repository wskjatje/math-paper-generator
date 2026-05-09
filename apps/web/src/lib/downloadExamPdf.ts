/**
 * 快照 PDF：`downloadElementAsPdf` 用 html2canvas 栅格化 DOM，再塞进 jsPDF（一键下载，清晰度有限）。
 * 矢量 PDF：请用 `startExamPdfViaBrowserPrint`，由用户在打印对话框中选「另存为 PDF」（推荐）。
 *
 * html2canvas 不支持解析 CSS 中的 oklch()/lab() 等（Tailwind v4 常用），需在克隆文档里剔除外链样式并替换。
 */

/** 导出 PDF 时整页底色（与站内 Academia 羊皮纸屏显区分） */
const PDF_EXPORT_PAGE_BG = "#ffffff";

/**
 * 与 `styles.css` 中 `.exam-print-root--snapshot-compact` 配套；
 * html2canvas 不触发 `print` 媒体查询，需用此类触发与打印一致的紧凑卷面。
 */
export const EXAM_SNAPSHOT_COMPACT_CLASS = "exam-print-root--snapshot-compact";

/** html2canvas 内置解析器无法识别的颜色函数（多见于 Tailwind v4） */
export function sanitizeCssForHtml2Canvas(css: string): string {
  return css.replace(
    /oklch\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|hwb\([^)]*\)|color-mix\([^)]*\)/gi,
    "#64748b",
  );
}

function stripModernColorsFromInlineStyles(root: HTMLElement): void {
  const re = /oklch\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|hwb\([^)]*\)|color-mix\([^)]*\)/i;
  root.querySelectorAll("[style]").forEach((node) => {
    const el = node as HTMLElement;
    const st = el.getAttribute("style");
    if (!st || !re.test(st)) return;
    el.setAttribute("style", sanitizeCssForHtml2Canvas(st));
  });
}

/** html2canvas 会把 getComputedStyle 写成内联样式；屏幕端 .no-print 仅在 @media print 下隐藏，克隆里可能与 fallback 冲突，直接移除最稳妥 */
function removeNoPrintNodesFromPdfClone(root: HTMLElement): void {
  Array.from(root.querySelectorAll(".no-print")).forEach((el) => el.remove());
}

/** 外链样式已剥离后，用内联 !important 压住克隆里的 computed 拷贝（导出为白底卷面） */
function enforceExamPdfPaint(clonedDoc: Document, root: HTMLElement): void {
  root.style.setProperty("background-color", PDF_EXPORT_PAGE_BG, "important");
  root.style.setProperty("background-image", "none", "important");
  root.style.setProperty("padding-left", "1.5rem", "important");
  root.style.setProperty("padding-right", "1.5rem", "important");

  const html = clonedDoc.documentElement;
  const body = clonedDoc.body;
  if (html) {
    html.style.setProperty("background-color", PDF_EXPORT_PAGE_BG, "important");
    html.style.setProperty("background-image", "none", "important");
  }
  if (body) {
    body.style.setProperty("background-color", PDF_EXPORT_PAGE_BG, "important");
    body.style.setProperty("background-image", "none", "important");
    body.style.setProperty("margin", "0", "important");
    body.style.setProperty("padding", "0", "important");
  }

  root.querySelectorAll(".paper-card").forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty("background-color", PDF_EXPORT_PAGE_BG, "important");
    el.style.setProperty("border", "none", "important");
    el.style.setProperty("outline", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
  });

  const tintSelectors = [
    '[class*="parchment"]',
    '[class*="bg-accent"]',
    '[class*="bg-muted"]',
    '[class*="bg-amber"]',
    '[class*="bg-card"]',
    '[class*="bg-background"]',
    '[class*="bg-primary/"]',
    '[class*="bg-secondary"]',
  ].join(",");
  root.querySelectorAll(tintSelectors).forEach((node) => {
    const el = node as HTMLElement;
    if (el.classList.contains("rounded-full") && el.classList.contains("bg-primary")) return;
    el.style.setProperty("background-color", PDF_EXPORT_PAGE_BG, "important");
    el.style.setProperty("background-image", "none", "important");
  });
}

/** 采样像素判断截图是否几乎全白（html2canvas 在 scale 过大或克隆异常时会成功但无内容） */
function canvasLikelyBlank(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || canvas.width < 2 || canvas.height < 2) return true;
    const w = canvas.width;
    const h = canvas.height;
    const hasInk = (r: number, g: number, b: number, a: number) =>
      a >= 128 && (r < 252 || g < 252 || b < 252);

    const hotspots: [number, number][] = [
      [Math.floor(w / 2), Math.floor(h * 0.08)],
      [Math.floor(w / 2), Math.floor(h * 0.22)],
      [Math.floor(w / 2), Math.floor(h * 0.45)],
      [Math.floor(w * 0.25), Math.floor(h * 0.35)],
      [Math.floor(w * 0.75), Math.floor(h * 0.35)],
    ];
    for (const [x, y] of hotspots) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (hasInk(d[0], d[1], d[2], d[3])) return false;
    }

    const stepX = Math.max(1, Math.floor(w / 28));
    const stepY = Math.max(1, Math.floor(h / 28));
    let ink = 0;
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        if (hasInk(d[0], d[1], d[2], d[3])) ink++;
      }
    }
    return ink < 8;
  } catch {
    return false;
  }
}

function prepareClonedDocumentForHtml2Canvas(clonedDoc: Document, root: HTMLElement): void {
  clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((el) => el.remove());

  clonedDoc.querySelectorAll("style").forEach((el) => {
    const se = el as HTMLStyleElement;
    if (se.textContent) se.textContent = sanitizeCssForHtml2Canvas(se.textContent);
  });

  stripModernColorsFromInlineStyles(root);

  const fallback = clonedDoc.createElement("style");
  fallback.setAttribute("data-pdf-export-fallback", "1");
  fallback.textContent = `
    /* 截 PDF 时外链（Tailwind）已移除；版式与统一白底 */
    .no-print { display: none !important; }

    .exam-print-root {
      font-family: "Inter", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif !important;
      font-size: 15px !important;
      line-height: 1.6 !important;
      color: #1e293b !important;
      background: ${PDF_EXPORT_PAGE_BG} !important;
      min-height: 100% !important;
    }

    .exam-print-root h1,
    .exam-print-root .text-display {
      font-family: "Cormorant Garamond", "Source Han Serif SC", "Songti SC", Georgia, serif !important;
      font-weight: 600 !important;
      letter-spacing: -0.02em !important;
      line-height: 1.1 !important;
      color: #0f172a !important;
    }

    .exam-print-root .paper-card {
      background: ${PDF_EXPORT_PAGE_BG} !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }

    .exam-print-root header.paper-card {
      padding: 2rem !important;
      margin-bottom: 2rem !important;
      text-align: center !important;
    }

    .exam-print-root article.paper-card {
      padding: 1.75rem !important;
    }

    .exam-print-root .space-y-8 > * + * {
      margin-top: 2rem !important;
    }

    .exam-print-root .flex { display: flex !important; }
    .exam-print-root .inline-flex { display: inline-flex !important; }
    .exam-print-root .flex-wrap { flex-wrap: wrap !important; }
    .exam-print-root .items-start { align-items: flex-start !important; }
    .exam-print-root .items-center { align-items: center !important; }
    .exam-print-root .justify-between { justify-content: space-between !important; }
    .exam-print-root .justify-center { justify-content: center !important; }
    .exam-print-root .gap-4 { gap: 1rem !important; }
    .exam-print-root .gap-x-6 { column-gap: 1.5rem !important; }
    .exam-print-root .gap-y-2 { row-gap: 0.5rem !important; }
    .exam-print-root .gap-1\\.5 { gap: 0.375rem !important; }

    .exam-print-root .mt-3 { margin-top: 0.75rem !important; }
    .exam-print-root .mt-4 { margin-top: 1rem !important; }
    .exam-print-root .mt-5 { margin-top: 1.25rem !important; }
    .exam-print-root .mt-6 { margin-top: 1.5rem !important; }
    .exam-print-root .mb-1 { margin-bottom: 0.25rem !important; }
    .exam-print-root .mb-4 { margin-bottom: 1rem !important; }
    .exam-print-root .my-5 { margin-top: 1.25rem !important; margin-bottom: 1.25rem !important; }
    .exam-print-root .mx-auto { margin-left: auto !important; margin-right: auto !important; }

    .exam-print-root .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
    .exam-print-root .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
    .exam-print-root .text-3xl { font-size: 1.875rem !important; line-height: 2.25rem !important; }
    .exam-print-root .text-5xl,
    .exam-print-root .md\\:text-5xl { font-size: 3rem !important; line-height: 1 !important; }
    .exam-print-root .italic { font-style: italic !important; }
    .exam-print-root .uppercase { text-transform: uppercase !important; }
    .exam-print-root .tracking-wider { letter-spacing: 0.05em !important; }
    .exam-print-root .tracking-\\[0\\.3em\\] { letter-spacing: 0.3em !important; }
    .exam-print-root .leading-relaxed { line-height: 1.625 !important; }
    .exam-print-root .max-w-2xl { max-width: 42rem !important; }
    .exam-print-root .text-center { text-align: center !important; }
    .exam-print-root .font-medium { font-weight: 500 !important; }
    .exam-print-root .list-none { list-style: none !important; padding-left: 0 !important; }
    .exam-print-root .space-y-1\\.5 > * + * { margin-top: 0.375rem !important; }

    .exam-print-root .text-muted-foreground { color: #64748b !important; }
    .exam-print-root .text-foreground { color: #1e293b !important; }
    .exam-print-root .text-primary { color: #1e3a5f !important; }
    .exam-print-root .text-gold { color: #a16207 !important; }
    .exam-print-root .hover\\:underline { text-decoration: none !important; }

    .exam-print-root .gold-divider {
      height: 2px !important;
      width: 3rem !important;
      border-radius: 2px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      background: linear-gradient(90deg, #d4a84b, #b45309) !important;
    }

    .exam-print-root .prose {
      color: #1e293b !important;
      max-width: none !important;
    }
    .exam-print-root .prose p { margin-top: 0.5em !important; margin-bottom: 0.5em !important; }
    .exam-print-root .prose strong { color: inherit !important; font-weight: 600 !important; }

    .border-gold { border-color: #ca8a04 !important; }
    .bg-parchment\\/50, .bg-parchment\\/35 { background-color: ${PDF_EXPORT_PAGE_BG} !important; }
    .bg-accent\\/30 { background-color: ${PDF_EXPORT_PAGE_BG} !important; }
    .border-border { border-color: #e5e7eb !important; }

    /* 导出域内凡带 bg-* 的块一律与白底同色（避免羊皮纸/浅灰第二種底色）；实心主色圆点保留 */
    .exam-print-root [class*="bg-"]:not(.bg-primary) {
      background-color: ${PDF_EXPORT_PAGE_BG} !important;
      background-image: none !important;
    }
    .exam-print-root .rounded-full.bg-primary {
      background-color: #1e3a5f !important;
    }

    details summary { list-style: none !important; }
    .katex { font-size: 1.05em !important; }
    .katex-display { margin: 0.75em 0 !important; text-align: center !important; overflow-x: auto !important; }
  `;
  clonedDoc.head.appendChild(fallback);

  removeNoPrintNodesFromPdfClone(root);
  enforceExamPdfPaint(clonedDoc, root);
}

/**
 * 使用浏览器原生打印管线导出 PDF：在对话框中将打印机选为「另存为 PDF」。
 * 由 Chromium/WebKit 直接排版页面，文字与公式通常比 html2canvas 整页快照更清晰。
 */
export function startExamPdfViaBrowserPrint(printRoot: HTMLElement | null): void {
  if (typeof window === "undefined") return;
  if (!printRoot) return;
  printRoot.scrollIntoView({ block: "start", behavior: "instant" });
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 80);
    });
  });
}

export async function downloadElementAsPdf(element: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  element.scrollIntoView({ block: "start", behavior: "instant" });
  element.classList.add(EXAM_SNAPSHOT_COMPACT_CLASS);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 50));

  /** 先较低 scale 保证有墨，再高 scale 试清晰度；全白则自动换档 */
  const attempts: Array<{
    scale: number;
    foreignObjectRendering?: boolean;
  }> = [
    { scale: 2, foreignObjectRendering: false },
    { scale: 2.5, foreignObjectRendering: false },
    { scale: 3, foreignObjectRendering: false },
    { scale: 1.5, foreignObjectRendering: false },
    { scale: 1, foreignObjectRendering: false },
    { scale: 1, foreignObjectRendering: true },
  ];

  let canvas: HTMLCanvasElement | null = null;
  let lastErr: unknown;
  try {
    for (const a of attempts) {
      try {
        const shot = await html2canvas(element, {
          scale: a.scale,
          backgroundColor: PDF_EXPORT_PAGE_BG,
          logging: false,
          useCORS: true,
          allowTaint: false,
          foreignObjectRendering: a.foreignObjectRendering ?? false,
          imageTimeout: 20000,
          removeContainer: true,
          onclone: (clonedDoc, cloned) => {
            prepareClonedDocumentForHtml2Canvas(clonedDoc, cloned);
          },
        });
        if (shot.width === 0 || shot.height === 0) continue;
        if (canvasLikelyBlank(shot)) {
          canvas = null;
          continue;
        }
        canvas = shot;
        break;
      } catch (e) {
        lastErr = e;
        canvas = null;
      }
    }

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error(
        lastErr instanceof Error ? lastErr.message : "页面截图失败（画布为空），请改用「打印」",
      );
    }

  /** 过长画布在个别浏览器会拒绝 toDataURL；略缩小再试 */
  const maxSide = 8192;
  let exportCanvas = canvas;
  if (canvas.width > maxSide || canvas.height > maxSide) {
    const r = Math.min(maxSide / canvas.width, maxSide / canvas.height, 1);
    const scaled = document.createElement("canvas");
    scaled.width = Math.floor(canvas.width * r);
    scaled.height = Math.floor(canvas.height * r);
    const ctx = scaled.getContext("2d");
    if (!ctx) throw new Error("无法创建画布上下文");
    ctx.fillStyle = PDF_EXPORT_PAGE_BG;
    ctx.fillRect(0, 0, scaled.width, scaled.height);
    ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    exportCanvas = scaled;
  }

  /**
   * jsPDF 嵌入超大 PNG 的 data URL 在部分浏览器会异常（空白页）；试卷导出统一用高质量 JPEG，兼容性最好。
   */
  let imgData: string;
  const jpegQuality = 0.94;
  try {
    imgData = exportCanvas.toDataURL("image/jpeg", jpegQuality);
    if (!imgData.startsWith("data:image/jpeg") || imgData.length < 500) {
      throw new Error("jpeg_empty");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Tainted") || msg.includes("security")) {
      throw new Error("页面含无法导出的跨域资源，请改用「打印」另存为 PDF");
    }
    try {
      imgData = exportCanvas.toDataURL("image/png");
      if (!imgData.startsWith("data:image/png") || imgData.length < 500) {
        throw new Error("png_empty");
      }
    } catch (e2) {
      throw new Error(
        e2 instanceof Error ? e2.message : "无法生成图片数据，请改用「打印」另存为 PDF",
      );
    }
  }

  const imageFormat = imgData.startsWith("data:image/png") ? "PNG" : "JPEG";

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (exportCanvas.height * pageWidth) / exportCanvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, imageFormat, 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, imageFormat, 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const safe = fileName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "试卷";
  pdf.save(`${safe}.pdf`);
  } finally {
    element.classList.remove(EXAM_SNAPSHOT_COMPACT_CLASS);
  }
}
