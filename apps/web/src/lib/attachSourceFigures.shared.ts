/**
 * 将抽取 bundle 中的原题图裁剪挂到导入题目 attachments（role=source_figure）。
 * AI 返回的 figure_scene 项标记为 derived_diagram，不覆盖原图。
 */
import type {
  AssembledQuestionCandidate,
} from "@/lib/importQuestionAssemble.shared";
import type { DocumentExtractionBundle, SourceBlock } from "@/lib/documentExtraction.shared";
import type { Question, QuestionAttachment } from "@/lib/types";
import {
  isDerivedDiagramAttachment,
  isSourceVisualAttachment,
  mergeDerivedFigureAttachment,
} from "@/lib/attachmentRoles.shared";

function blockMap(bundle: DocumentExtractionBundle): Map<string, SourceBlock> {
  const m = new Map<string, SourceBlock>();
  for (const page of bundle.pages) {
    for (const b of page.blocks) m.set(b.id, b);
  }
  return m;
}

/**
 * 从候选题的 picture 块解析可展示的原图 attachments。
 */
export function sourceFigureAttachmentsForCandidate(
  bundle: DocumentExtractionBundle,
  candidate: AssembledQuestionCandidate,
): QuestionAttachment[] {
  const blocks = blockMap(bundle);
  const assetById = new Map(bundle.assets.map((a) => [a.id, a]));
  const out: QuestionAttachment[] = [];
  let order = 0;

  for (const blockId of candidate.figureBlockIds) {
    const block = blocks.get(blockId);
    if (!block) continue;
    const asset = block.assetId ? assetById.get(block.assetId) : undefined;
    if (asset?.uri) {
      out.push({
        kind: "image",
        uri: asset.uri,
        alt: `原卷图（页 ${candidate.pageIndex + 1}）`,
        role: "source_figure",
        asset_id: asset.id,
        source_region_id: candidate.regionId,
        source_page: candidate.pageIndex,
        order_index: order++,
        mime_type: asset.mimeType,
        sha256: asset.sha256,
        width: asset.width,
        height: asset.height,
      });
      continue;
    }
    // 无独立裁剪时：回退同页 page_image（仍标明 source，审核可见）
    const pageAsset = bundle.assets.find(
      (a) => a.role === "page_image" && a.pageIndex === candidate.pageIndex && a.uri,
    );
    if (pageAsset) {
      out.push({
        kind: "image",
        uri: pageAsset.uri,
        alt: `原卷页图（页 ${candidate.pageIndex + 1}，整页参考）`,
        role: "page_image",
        asset_id: pageAsset.id,
        source_region_id: candidate.regionId,
        source_page: candidate.pageIndex,
        order_index: order++,
        mime_type: pageAsset.mimeType,
        sha256: pageAsset.sha256,
      });
    }
  }

  // 若候选声明有图但块未解析到 URI：仍尝试挂同页 page_image 一次，便于审核
  if (candidate.figureBlockIds.length > 0 && out.length === 0) {
    const pageAsset = bundle.assets.find(
      (a) => a.role === "page_image" && a.pageIndex === candidate.pageIndex && a.uri,
    );
    if (pageAsset) {
      out.push({
        kind: "image",
        uri: pageAsset.uri,
        alt: `原卷页图（页 ${candidate.pageIndex + 1}）`,
        role: "page_image",
        asset_id: pageAsset.id,
        source_region_id: candidate.regionId,
        source_page: candidate.pageIndex,
        order_index: 0,
        mime_type: pageAsset.mimeType,
        sha256: pageAsset.sha256,
      });
    }
  }

  return out;
}

/**
 * 原地合并：保留/补全 source_figure，把 AI figure_scene 标为 derived_diagram。
 */
export function attachSourceFiguresOntoQuestions(
  questions: Question[],
  candidates: AssembledQuestionCandidate[],
  bundle: DocumentExtractionBundle,
): void {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const candidate = candidates[i];
    const sourceAtts = candidate
      ? sourceFigureAttachmentsForCandidate(bundle, candidate)
      : [];

    let next = [...(q.attachments ?? [])];

    // 将已有 scene / figure 标成 derived，避免被当成原图
    next = next.map((a) => {
      if (isSourceVisualAttachment(a) && a.role) return a;
      if (a.figure_scene || a.kind === "figure") {
        return { ...a, role: "derived_diagram" as const };
      }
      return a;
    });

    // 先确保 source 在前
    for (const s of sourceAtts) {
      const dup = next.some(
        (a) => isSourceVisualAttachment(a) && (a.asset_id === s.asset_id || a.uri === s.uri),
      );
      if (!dup) {
        next = [s, ...next];
      }
    }

    // 若存在多个 derived，用 merge 保序（不删 source）
    const derived = next.filter(isDerivedDiagramAttachment);
    const sourcesAndTables = next.filter(
      (a) => isSourceVisualAttachment(a) || a.kind === "table",
    );
    const other = next.filter(
      (a) =>
        !isSourceVisualAttachment(a) &&
        a.kind !== "table" &&
        !isDerivedDiagramAttachment(a),
    );
    let merged = [...sourcesAndTables, ...other];
    for (const d of derived) {
      merged = mergeDerivedFigureAttachment(merged, d);
    }

    q.attachments = merged.map((a, idx) => ({ ...a, order_index: a.order_index ?? idx }));
  }
}
