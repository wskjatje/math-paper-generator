import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  applyOcrRepairLexiconRules,
  diffPlaintextLinesToLiteralRules,
} from "@/lib/ocrRepairLexicon.shared";
import {
  loadOcrRepairLexiconRules,
  persistLiteralRulesToStores,
} from "@/lib/ocrRepairLexiconStore.server";

const TextSchema = z.object({
  text: z.string().max(2_000_000),
});

/** 抽取合并后 / 入库前：套用服务端词典（云端 MySQL 或 data 文件） */
export const applyOfflineOcrLexiconLayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => TextSchema.parse(data))
  .handler(async ({ data }) => {
    const rules = await loadOcrRepairLexiconRules();
    return { text: applyOcrRepairLexiconRules(data.text, rules) };
  });

const DiffSchema = z.object({
  beforeText: z.string().max(2_000_000),
  afterText: z.string().max(2_000_000),
});

/**
 * 将「流水线预览稿」与「用户最终稿」按行对比，写入词典（字面替换）。
 * 仅服务端写库，前端不落存储。
 */
export const persistOcrLexiconFromImportDiff = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DiffSchema.parse(data))
  .handler(async ({ data }) => {
    const pairs = diffPlaintextLinesToLiteralRules(data.beforeText, data.afterText, {
      minLen: 8,
      maxRules: 32,
      /** 换行结构一变就放弃逐行规则，减少噪声词条入库 */
      requireSameLineCount: true,
    });
    if (!pairs.length) return { upserted: 0 };
    return persistLiteralRulesToStores(pairs.map((p) => ({ ...p, note: "import-manual-diff" })));
  });
