# Educational text canonicalization（确定性 compiler）

## Constitutional invariant

**Preview authority === persist authority**

`normalizeFaithfulOcrPreviewText` 与 `normalizeOfflineImportOcrTextForPersist` 均调用同一实现：
`runEducationalTextCanonicalization`（`apps/web/src/lib/educationalTextCanonicalization.shared.ts`）。

AI structuring（拆题、拓扑、题型推断）**必须**在 canonical text 之后执行。

## Phase timeline（observational）

| Phase | 职责 |
|-------|------|
| `ocr_raw` | 输入快照（无变换） |
| `transport_glyph_repair` | 填空、`<<< 文件` 题头、LaTeX `\(\cdot\)` 等 transport 噪声 |
| `diagram_hallucination_strip` | 图区轴标连环截断 |
| `geometry_notation_normalize` | 坐标系卷：△、√、图①、∠ 等 |
| `geometry_semantic_rejoin` | GOT LaTeX 分词缝合（`\triangle A O B`→`△AOB`、`等边 \(\triangle\) \(D E F\)`→`等边△DEF` 等）；坐标系卷轻量 Unicode lowering |
| `enumeration_semantic_reconstruction` | 共图大题 (1)(2) 塌平 → `（I）（II）` + `①②`（图①图② + 重复枚举信号） |
| `math_exam_lowering` | 符号词典、科学记数法、CJK 空格等 |

## Educational Presentation Layer (EPL Runtime)

见 [educational-presentation-layer.md](./educational-presentation-layer.md)。

canonical 冻结后：**`buildEducationalAstFromCanonical` → `EducationalAstNodeRenderer`（按 `node.type`）**；AST `replay_mutation=none`，不写回 persist。
| `canonical_text` | 最终 trim |

入库后可在 `exam.import_parse_quality.text_canonicalization_v1` 查看分阶段 `edits[]`（`phase`、`epistemic_class`、`provenance`、`before`/`after`、`confidence`），与 AI / linker 分层。

线下导入对话框内嵌 **CanonicalizationForensicViewer**（时间线 / Diff / AI boundary / 导出 canonical text），与卷内 `import_parse_quality` 同源结构。

## 入库卷 Forensics（constitutional surface）

导入卷在 **`/exam/:id?figures_debug=1`**（本地 `import.meta.env.DEV` 下导入卷默认开启）题列表上方展示 **ExamForensicsPanel**：

| 分区 | 内容 |
|------|------|
| Text compiler replay | 冻结的 `text_canonicalization_v1` trace + 持久化题干拼接 |
| Topology inference | `parent_question_topology` + `decision_trace`（root/subparts/shared_figure_scope、before/after 摘录） |
| Figure runtime | `figure_lifecycle_timelines_v1`、materialization |
| Authority / bind | per_question `supply_state`、`bind_refused`、`figure_link_traces_v1` 归因 |
| Import structuring | `import_chain` 等 AI/拆题线索 |

入库快照另写：

- `forensic_runtime_versions` — semantic ABI（各子 runtime 标签）
- `semantic_execution_lineage_v1` — cross-runtime `lineage_id` + 子 `*_trace_id`（见 [SEMANTIC-REPLAY-LINEAGE-v1.md](../governance/SEMANTIC-REPLAY-LINEAGE-v1.md)）

**不变量**：replay 只读冻结 provenance；runtime 升级不得 retroactive 改写已入库 `import_parse_quality`。

每题卡片内仍可展开 **Figure ownership（调试）**（`figure_refs` / `resolveFigureResources`）。

**注意**：旧卷若无 `text_canonicalization_v1` 需重新导入才有 compiler replay；导出 canonical 为当前持久化题干，非 transport OCR 重跑。

## 与 ownership / linker 的关系

- Canonicalization：**deterministic lowering**（glyph / notation）
- Linker / figure_refs：**authoritative bind**（另链）
- 勿将 provenance 混入 `figure_refs`
