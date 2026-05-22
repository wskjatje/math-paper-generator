from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "got-ocr"
    request_timeout_sec: int = 1800

    # Hugging Face：官方 GOT-OCR 2.0（与 Ucas-HaoranWei/GOT-OCR2.0 同源权重）
    got_model_id: str = "stepfun-ai/GOT-OCR-2.0-hf"
    got_use_gpu: bool = False
    got_max_new_tokens: int = 4096
    # 数学卷：输出 LaTeX/Markdown 友好格式（仍经前端规则归一化）
    # 试卷拍照优先纯文本；format=True 对部分图可能返回空，recognize 会自动回退
    got_format_output: bool = True
    # 识别前缩小长边，降低 CPU 推理耗时（竖拍卷 2400px→1600 通常快数倍）
    exam_ocr_max_side_px: int = 1600

    # 右栏示意图启发式（diagram_links）
    heuristic_diagram_right_ratio: float = 0.48
    heuristic_diagram_enabled: bool = True

    hf_home: str | None = None
    hf_endpoint: str | None = None
    hf_hub_download_timeout: int = 1800
    hf_hub_etag_timeout: int = 120
    # 宿主机预下载目录（compose 挂载 /models/got-ocr）；含 config.json 时优先于 Hub
    got_model_local_dir: str | None = None
