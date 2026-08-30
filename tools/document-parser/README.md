# 本机文档解析 Sidecar（Docling）

MIT 许可的 [Docling](https://github.com/docling-project/docling) 作为高保真后端。

## 系统要求

- **Python 3.10+**（推荐 Homebrew `python@3.12`）
- macOS 系统自带 `/usr/bin/python3`（多为 3.9）**不要用**：新 Xcode SDK 下编译 `pyobjc-core` 会失败（`-Wdefault-const-init-var-unsafe`）

```bash
brew install python@3.12   # 若尚未安装
```

可选：指定解释器 `export MPG_DOC_PARSER_PYTHON=/opt/homebrew/bin/python3.12`

## 安装

```bash
# 仓库根目录（推荐）
npm run doc-parser:install

# 或手动
cd tools/document-parser
bash install.sh
```

## 启动

```bash
npm run doc-parser
# 默认 127.0.0.1:8765
```

健康检查：`curl http://127.0.0.1:8765/health`

## 与 Node 集成

环境变量：

- `MPG_DOC_PARSER_URL`（默认 `http://127.0.0.1:8765`）
- `MPG_DOC_PARSER_ENABLED=1` 强制启用；未设置时自动探测 `/health`
- `MPG_DOC_PARSER_PYTHON` 仅安装脚本使用

未启动 Sidecar 或 Docling 不可用时，导入自动降级到现有 PDF.js/Tesseract，并在 bundle 上标记 `quality=basic_fallback`。
