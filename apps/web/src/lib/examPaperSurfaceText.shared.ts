/**
 * 试卷纸面保真：禁止产品/UI 元说明进入题干与打印稿。
 * 用保守正则剥除已知 chrome 句式；不臆造学科内容、不改写合法设问（如「下列说法正确的是」）。
 */

/** 卷面不得出现的产品/UI 作答说明（可随产品句式增补，勿写机器绝对路径） */
export const EXAM_PAPER_UI_META_INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /多选题[，,]?\s*至少\s*\d+\s*个选项[；;]?\s*请选出所有正确项[（(][^）)]*[）)][。．.]?/gu,
  /多选题[；;]?\s*请选出所有正确项[（(][^）)]*[）)][。．.]?/gu,
  /多选题[；;]?\s*请选出所有正确项[。．.]?/gu,
  /请选出所有正确项[（(]参考[^）)]*[）)][。．.]?/gu,
  /正确答案见[「「"']?查看答案与分步推导[」」"']?[。．.]?/gu,
  /参考[「「"']?查看答案与分步推导[」」"']?中的标准答案[。．.]?/gu,
  /选项（本书面卷印发）[。．.]?/gu,
  /请阅读下列选项，选择正确答案[。．.]?/gu,
  /选择所有正确项[。．.]?/gu,
];

/**
 * 从题干/选项等文本中剥除 UI 元说明；空白行压缩。
 */
export function stripExamPaperUiMetaInstructions(text: string): string {
  let s = String(text ?? "").replace(/\r\n/g, "\n");
  for (const re of EXAM_PAPER_UI_META_INSTRUCTION_PATTERNS) {
    s = s.replace(new RegExp(re.source, re.flags), "");
  }
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 命题 system prompt 负向约束（与剥除逻辑同源表述，避免双源漂移） */
export const EXAM_PAPER_NO_UI_META_PROMPT_RULE = `**卷面保真（强制）**：\`content\` / \`options\` 只写真实考题文字，须与正式打印卷一致。**禁止**写入产品或 UI 元说明，例如「请选出所有正确项」「至少 N 个选项」「参考查看答案与分步推导」「选项（本书面卷印发）」「请阅读下列选项，选择正确答案」等。多选/不定项仅用 type=\`multiple_choice_multi\` 与 options/answer 表达，勿在题干重复系统提示。`;
