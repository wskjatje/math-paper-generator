/** 网关 OCR 结果类型（浏览器 / 服务端共用，勿从 `.server` 引用） */

export type GatewayOcrResult =
  | { ok: true; text: string; engine?: string }
  | { ok: false; status?: number; message: string };

export type GatewayOcrJsonResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; status?: number; message: string };
