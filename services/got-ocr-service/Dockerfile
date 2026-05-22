# GOT-OCR 2.0 服务镜像
# 国内构建默认走清华 PyPI 镜像，避免 Docker 内访问 pypi.org SSL/截断失败：
#   docker compose ... build --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
FROM public.ecr.aws/docker/library/python:3.12-slim

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn
ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn

WORKDIR /app

# 国内构建：替换 Debian 源，避免 deb.debian.org 超时
RUN set -eux; \
    for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do \
      [ -f "$f" ] || continue; \
      sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}|g" "$f"; \
    done; \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    -i "${PIP_INDEX_URL}" --trusted-host "${PIP_TRUSTED_HOST}" \
    --default-timeout=180 --retries 8

COPY requirements.txt .

# 先装轻量依赖，再装 torch/transformers（体积大、易超时）
RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] python-multipart numpy opencv-python-headless \
    pillow pydantic-settings safetensors sentencepiece "protobuf>=4.25,<6" \
    -i "${PIP_INDEX_URL}" --trusted-host "${PIP_TRUSTED_HOST}" \
    --default-timeout=180 --retries 8

RUN pip install --no-cache-dir \
    "torch>=2.4.0,<2.7" "transformers>=4.48.0,<5.9" "accelerate>=0.33.0" \
    -i "${PIP_INDEX_URL}" --trusted-host "${PIP_TRUSTED_HOST}" \
    --default-timeout=300 --retries 10

COPY app ./app

ENV HF_HOME=/root/.cache/huggingface
ENV PIP_INDEX_URL=${PIP_INDEX_URL}
ENV PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST}

EXPOSE 8101
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8101"]
