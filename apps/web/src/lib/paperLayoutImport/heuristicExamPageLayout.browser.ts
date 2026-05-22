/**
 * 浏览器专用：从整页 data URL 提取墨迹连通域 → {@link buildHeuristicFigurePlan}。
 */
import { buildHeuristicFigurePlan } from "@/lib/paperLayoutImport/heuristicFigurePlan.shared";
import type { HeuristicFigurePlanItem } from "@/lib/paperLayoutImport/types.shared";
import type { NormBBox } from "@/lib/paperLayoutImport/types.shared";

const MAX_CANVAS_W = 520;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("无法解码页面图片"));
    img.src = dataUrl;
  });
}

function grayUint8(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
  }
  return out;
}

/** 8 邻域连通域；坐标映射回原图归一化 bbox */
function connectedComponentsToNormRegions(
  gray: Uint8Array,
  w: number,
  h: number,
  origW: number,
  origH: number,
): NormBBox[] {
  const thr = 185;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    mask[i] = gray[i]! < thr ? 1 : 0;
  }
  const visited = new Uint8Array(w * h);
  const minA = w * h * 0.003;
  const maxA = w * h * 0.45;
  const out: NormBBox[] = [];

  const sx = origW / w;
  const sy = origH / h;

  const idxAt = (x: number, y: number) => y * w + x;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = idxAt(x, y);
      if (!mask[start] || visited[start]) continue;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let cnt = 0;
      const stack: number[] = [start];
      visited[start] = 1;

      while (stack.length) {
        const cur = stack.pop()!;
        cnt++;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const ni = idxAt(nx, ny);
            if (!mask[ni] || visited[ni]) continue;
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }

      if (cnt < minA || cnt > maxA) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const aspect = bw / Math.max(bh, 1e-6);
      if (aspect > 14 || aspect < 0.045) continue;

      const nx = minX * sx;
      const ny = minY * sy;
      const nw = bw * sx;
      const nh = bh * sy;

      out.push({
        x: nx / origW,
        y: ny / origH,
        w: nw / origW,
        h: nh / origH,
      });
    }
  }

  return out;
}

/**
 * 将整页 raster 降为 MAX_CANVAS_W 宽后做连通域分析。
 */
export async function extractNormRegionsFromDataUrl(dataUrl: string): Promise<NormBBox[]> {
  const img = await loadImage(dataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  if (origW < 8 || origH < 8) return [];

  const scale = Math.min(1, MAX_CANVAS_W / origW);
  const cw = Math.max(1, Math.floor(origW * scale));
  const ch = Math.max(1, Math.floor(origH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);

  const imageData = ctx.getImageData(0, 0, cw, ch);
  const gray = grayUint8(imageData);
  return connectedComponentsToNormRegions(gray, cw, ch, origW, origH);
}

export async function planHeuristicFiguresFromDataUrl(
  imageIndex: number,
  ocrText: string,
  dataUrl: string,
): Promise<HeuristicFigurePlanItem[]> {
  const regions = await extractNormRegionsFromDataUrl(dataUrl);
  return buildHeuristicFigurePlan(imageIndex, ocrText, regions);
}
