from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """网关环境变量（Docker / K8s 注入）。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ocr_service_url: str = "http://127.0.0.1:8101"
    formula_service_url: str = "http://127.0.0.1:8102"
    vision_service_url: str = "http://127.0.0.1:8103"
    agent_service_url: str = "http://127.0.0.1:8104"
    questions_service_url: str = "http://127.0.0.1:8105"
    # 置空则不下挂 Web 反代，仅暴露 /api/v1/*
    web_upstream_url: str = ""
    # 反向代理到 OCR 等上游的最大等待秒数（大模型冷启动可能超过 120s）
    gateway_upstream_timeout_sec: float = 600.0
