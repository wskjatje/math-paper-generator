import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { postGatewayOcrImage, postGatewayOcrJson } from "@/lib/gatewayOcr.server";

const GatewayOcrSchema = z.object({
  image_base64: z.string().min(1).max(35_000_000),
  filename: z.string().max(512).optional(),
  mime_type: z.string().max(120).optional(),
  /** 设置页保存的本机网关根 URL；优先于服务端 MPG_GATEWAY_URL */
  gateway_base_url: z.string().max(512).optional(),
});

/**
 * 将图片 Base64 转发至网关 GOT-OCR 2.0。
 */
export const gatewayOcrImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GatewayOcrSchema.parse(data))
  .handler(async ({ data }) => {
    let raw = data.image_base64.trim();
    if (raw.includes(",")) raw = raw.split(",", 2)[1] ?? raw;
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      return { ok: false as const, message: "无效的 Base64" };
    }
    if (!buf.length) return { ok: false as const, message: "空图片" };
    const filename =
      (data.filename ?? "upload.png").replace(/^.*[/\\]/, "").slice(0, 200) || "upload.png";
    const mime = (data.mime_type ?? "image/png").slice(0, 120) || "image/png";
    return postGatewayOcrImage({
      imageBytes: buf,
      filename,
      mimeType: mime,
      gatewayBaseUrlOverride: data.gateway_base_url?.trim() || undefined,
    });
  });

/** 返回网关完整 JSON，供前端可插拔 OCR 流水线；失败形态与 gatewayOcrImage 一致。 */
export const gatewayOcrJson = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GatewayOcrSchema.parse(data))
  .handler(async ({ data }) => {
    let raw = data.image_base64.trim();
    if (raw.includes(",")) raw = raw.split(",", 2)[1] ?? raw;
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      return { ok: false as const, message: "无效的 Base64" };
    }
    if (!buf.length) return { ok: false as const, message: "空图片" };
    const filename =
      (data.filename ?? "upload.png").replace(/^.*[/\\]/, "").slice(0, 200) || "upload.png";
    const mime = (data.mime_type ?? "image/png").slice(0, 120) || "image/png";
    return postGatewayOcrJson({
      imageBytes: buf,
      filename,
      mimeType: mime,
      gatewayBaseUrlOverride: data.gateway_base_url?.trim() || undefined,
    });
  });
