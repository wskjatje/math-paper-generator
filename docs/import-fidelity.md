# 导入保真（DocumentExtractionBundle）

见计划「试卷导入保真升级」与 `docs/prd-offline-import-parity.md` §9。

## 本机 Sidecar

需要 **Python 3.10+**（推荐 `brew install python@3.12`）。系统自带 Python 3.9 会因 `pyobjc-core` 编译失败装不上 Docling。

```bash
npm run doc-parser:install   # 一次性（自动选用 3.12/3.11）
npm run doc-parser           # http://127.0.0.1:8765
```

Node 侧通过 `MPG_DOC_PARSER_URL`（默认同上）调用；失败自动 `basic_fallback`。

## 黄金集

- `examples/v1/import-fidelity/golden-math-radical-multipanel.json`
- 指标：根式/数值 exact match、题图召回、多图完整率、来源可追溯

## Electron

桌面包不内嵌 Docling 模型。需要高保真时在本机另启 Sidecar；否则导入标记为基础抽取并要求人工核对。
