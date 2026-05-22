const STORAGE_KEY = "mpg_gateway_settings_v1";

export type GatewaySettingsForm = {
  /** 网关根 URL，如 http://localhost:8090；留空则仅用服务端环境变量 MPG_GATEWAY_URL */
  baseUrl: string;
};

export const DEFAULT_GATEWAY_SETTINGS: GatewaySettingsForm = {
  baseUrl: "",
};

export function loadGatewaySettings(): GatewaySettingsForm {
  if (typeof window === "undefined") return { ...DEFAULT_GATEWAY_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GATEWAY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GatewaySettingsForm>;
    return {
      ...DEFAULT_GATEWAY_SETTINGS,
      baseUrl:
        typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_GATEWAY_SETTINGS.baseUrl,
    };
  } catch {
    return { ...DEFAULT_GATEWAY_SETTINGS };
  }
}

export function saveGatewaySettings(settings: GatewaySettingsForm): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 非空则随 gatewayOcrImage 下发；服务端优先于 MPG_GATEWAY_URL */
export function gatewayBaseUrlForRequest(settings: GatewaySettingsForm): string | undefined {
  const t = settings.baseUrl?.trim();
  return t || undefined;
}
