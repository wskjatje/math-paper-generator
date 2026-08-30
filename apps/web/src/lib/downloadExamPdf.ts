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
    .exam-print-root [class*="bg-"]:not(.bg-primary):not(.exam-geometry-diagram) {
      background-color: ${PDF_EXPORT_PAGE_BG} !important;
      background-image: none !important;
    }
    /*
     * html2canvas 克隆里已移除 Tailwind；text-foreground/55 等修饰类不存在，
     * SVG 使用 stroke=currentColor 时墨色丢失 → 示意图整段空白。以下强制具象墨色。
     */
    .exam-print-root figure.exam-geometry-diagram {
      background-color: #f1f5f9 !important;
      border-color: #e5e7eb !important;
    }
    .exam-print-root figure.exam-geometry-diagram figcaption {
      color: #64748b !important;
    }
    .exam-print-root figure.exam-geometry-diagram svg {
      color: #1e293b !important;
    }
    .exam-print-root figure.exam-geometry-diagram svg line {
      stroke: #1e293b !important;
    }
    .exam-print-root figure.exam-geometry-diagram svg path {
      stroke: rgba(30, 41, 59, 0.55) !important;
    }
    .exam-print-root figure.exam-geometry-diagram svg circle[stroke] {
      stroke: rgba(30, 41, 59, 0.7) !important;
    }
    .exam-print-root figure.exam-geometry-diagram svg g > circle[fill] {
      fill: #1e293b !important;
    }
    .exam-print-root figure.exam-geometry-diagram svg text {
      fill: #1e293b !important;
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
 *
 * 通过约 blank iframe 打印，避免页脚出现本页 localhost 长 URL。
 * `documentTitle` 写入打印帧 <title>，供「另存为 PDF」默认文件名；请同时取消勾选「页眉和页脚」以免标题进纸边。
 */
export function startExamPdfViaBrowserPrint(
  printRoot: HTMLElement | null,
  opts?: { documentTitle?: string },
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!printRoot) return;

  const exportTitle = (opts?.documentTitle ?? "").trim() || "试卷";
  const prevTitle = document.title;
  // 同步到顶层 title：部分浏览器「另存为 PDF」取的是 opener/顶层标题
  document.title = exportTitle;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "print-frame");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const frameWin = iframe.contentWindow;
  const frameDoc = iframe.contentDocument;
  if (!frameWin || !frameDoc) {
    printRoot.scrollIntoView({ block: "start", behavior: "instant" });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          try {
            window.print();
          } finally {
            document.title = prevTitle;
          }
        }, 80);
      });
    });
    iframe.remove();
    return;
  }

  const styleLinks = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((node) => node.outerHTML)
    .join("\n");

  const clone = printRoot.cloneNode(true) as HTMLElement;
  // 打印帧内不再需要站内调试/操作条
  clone.querySelectorAll(".no-print").forEach((el) => el.remove());

  frameDoc.open();
  frameDoc.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<base href="${escapeHtmlAttr(window.location.origin)}/"/>
<title>${escapeHtmlText(exportTitle)}</title>
${styleLinks}
<style>
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body class="exam-print-frame-body">
${clone.outerHTML}
</body>
</html>`);
  frameDoc.close();
  try {
    frameDoc.title = exportTitle;
  } catch {
    /* ignore */
  }

  const cleanup = () => {
    document.title = prevTitle;
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  const runPrint = () => {
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      window.print();
    } finally {
      // afterprint 在部分 WebKit 上不可靠：延迟回收 iframe
      window.setTimeout(cleanup, 1000);
    }
  };

  // 等样式与图片布局
  window.setTimeout(runPrint, 200);
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

    // @epl-ast-contract-allow ADR-O18 LEGACY raster snapshot PDF — migrate to negotiated projection (P3.3)
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      // @epl-ast-contract-allow ADR-O18 LEGACY heuristic addPage until lowerNegotiatedDocumentToPdfModel drives pages
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
