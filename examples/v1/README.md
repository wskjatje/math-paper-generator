# examples/v1 — 工程夹具（非演示卷）

本目录**不是**产品演示试卷，也**不参与**运行时读卷。

| 路径 | 用途 |
|------|------|
| `diagram-calibration/` | 题图 Pack 机判标定用例 |
| `import-fidelity/` | 导入保真黄金样 |
- 勿当作「演示」删除；删了会破坏标定测试与文档对照。
- 勿在应用代码中硬编码本目录路径或其中假 ID；测试通过相对路径或显式 fixture 常量加载即可。
- 正式试卷落盘见 `papers/README.md`；Schema 见 `schemas/v1/`。
