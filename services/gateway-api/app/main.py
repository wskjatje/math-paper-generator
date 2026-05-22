"""
API 网关：聚合 OCR / 公式 / 视觉 / Agent；可选通过中间件将浏览器流量反代至 TanStack Web。
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import Settings

HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    },
)


def _service_map(settings: Settings) -> dict[str, str]:
    return {
        "ocr": settings.ocr_service_url.rstrip("/"),
        "formula": settings.formula_service_url.rstrip("/"),
        "vision": settings.vision_service_url.rstrip("/"),
        "agent": settings.agent_service_url.rstrip("/"),
        "questions": settings.questions_service_url.rstrip("/"),
    }


def _filter_request_headers(request: Request) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in request.headers.items():
        if k.lower() in HOP_BY_HOP:
            continue
        out[k] = v
    return out


def _filter_response_headers(resp: httpx.Response) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in resp.headers.items():
        lk = k.lower()
        if lk in HOP_BY_HOP or lk == "content-encoding":
            continue
        out[k] = v
    return out


class WebUpstreamMiddleware(BaseHTTPMiddleware):
    """未命中网关自有路由时，将请求转发至 WEB_UPSTREAM_URL（TanStack）。"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path.startswith(("/api/", "/health", "/v1/ready")):
            return await call_next(request)
        if path.startswith(("/openapi.json", "/docs", "/redoc")):
            return await call_next(request)

        settings: Settings = request.app.state.settings
        base = settings.web_upstream_url.strip()
        if not base:
            return await call_next(request)

        client: httpx.AsyncClient = request.app.state.http
        url = base.rstrip("/") + path
        if request.url.query:
            url = f"{url}?{request.url.query}"
        # 保留浏览器 Host（如 localhost:8090）。勿改写为 Docker 内网名 web:8080 ——
        # Vite preview 会按 allowedHosts 拒绝未知 Host 并返回 403，网关侧表现为 502 Bad Gateway。
        hdrs = _filter_request_headers(request)
        body = await request.body()
        try:
            resp = await client.request(
                request.method,
                url,
                content=body if body else None,
                headers=hdrs,
            )
        except httpx.RequestError:
            return Response(
                content=b"Bad Gateway",
                status_code=502,
                media_type="text/plain",
            )
        return Response(
            content=await resp.aread(),
            status_code=resp.status_code,
            headers=_filter_response_headers(resp),
            media_type=resp.headers.get("content-type"),
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    upstream_sec = max(30.0, float(settings.gateway_upstream_timeout_sec))
    async with httpx.AsyncClient(timeout=httpx.Timeout(upstream_sec)) as client:
        app.state.http = client
        yield


app = FastAPI(title="zhixue-gateway", version="0.2.0", lifespan=lifespan)
app.add_middleware(WebUpstreamMiddleware)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "component": "gateway"}


@app.get("/v1/ready")
async def ready(request: Request) -> JSONResponse:
    settings: Settings = request.app.state.settings
    client: httpx.AsyncClient = request.app.state.http
    services = _service_map(settings)
    status: dict[str, bool] = {}
    for name, b in services.items():
        try:
            r = await client.get(f"{b}/health", timeout=3.0)
            status[name] = r.status_code == 200
        except Exception:
            status[name] = False
    web_ok: bool | str = "skipped"
    if settings.web_upstream_url.strip():
        try:
            bu = settings.web_upstream_url.rstrip("/")
            r = await client.get(
                f"{bu}/",
                timeout=5.0,
                headers={"Host": "localhost:8090"},
            )
            web_ok = 200 <= r.status_code < 400
        except Exception:
            web_ok = False
    return JSONResponse({"gateway": True, "services": status, "web_upstream": web_ok})


@app.api_route("/api/v1/{subpath:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_microservice(subpath: str, request: Request) -> Response:
    settings: Settings = request.app.state.settings
    client: httpx.AsyncClient = request.app.state.http
    key = subpath.split("/", 1)[0]
    svc = _service_map(settings).get(key)
    if not svc:
        raise HTTPException(404, f"unknown api namespace: {key}")
    upstream_path = f"/v1/{subpath}"
    url = f"{svc}{upstream_path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    body = await request.body()
    hdrs = _filter_request_headers(request)
    try:
        resp = await client.request(
            request.method,
            url,
            content=body if body else None,
            headers=hdrs,
        )
    except httpx.RequestError as e:
        detail = (f"{e!s}".strip() or "") or f"{type(e).__name__}"
        raise HTTPException(502, f"upstream error: {detail}") from e
    return Response(
        content=await resp.aread(),
        status_code=resp.status_code,
        headers=_filter_response_headers(resp),
        media_type=resp.headers.get("content-type"),
    )
