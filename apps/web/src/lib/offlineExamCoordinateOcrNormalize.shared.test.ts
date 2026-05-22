import { describe, expect, it } from "vitest";

import {
  assessOcrExtractQuality,
  flattenGotOcrTabularMarkup,
  normalizeCoordinatePlaneOcrText,
  normalizeGotOcrMcqOptionMarkers,
  normalizeOcrSqrtForms,
  stripGotOcrDiagramLabelRunaway,
  stripGotOcrEnumeratedParenthesisRunaway,
  stripGotOcrLatexInlineSpam,
  stripGotOcrPageHallucinations,
} from "@/lib/offlineExamCoordinateOcrNormalize.shared";
import { runEducationalTextCanonicalization } from "@/lib/educationalTextCanonicalization.shared";
import { applyEducationSymbolLexicon } from "@/lib/ocr/educationSymbolLexicon";
import { normalizeMathExamOcrText } from "@/lib/offlineExamOcrNormalize.shared";

const SNIPPET = `(22)在平面直角坐标系中，O为原点，直角 A408的顶点A(0,5)，B(5V3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)。
(1) 如图①，<EFO的度数为____°。`;

describe("offlineExamCoordinateOcrNormalize", () => {
  it("normalizeOcrSqrtForms", () => {
    expect(normalizeOcrSqrtForms("B(5V3,0)")).toContain("5√3");
  });

  it("normalizeCoordinatePlaneOcrText fixes triangle digit-four misread and angle", () => {
    const out = normalizeCoordinatePlaneOcrText(SNIPPET);
    expect(out).toMatch(/直角△A[A-Z]{2,3}/);
    expect(out).toMatch(/∠EFO/);
    expect(out).toMatch(/5√3/);
  });

  it("fixes spaced A 408 and tilde angle from gateway paddle output", () => {
    const raw = `(24)在平面直角坐标系中，O为原点，直角 A 408的顶点A(0,5)，等边 A DEF的顶点E(0,3)。
(1) 如图0，~EFO的度数为____°。本小原10分。顶点忆在第二象限。`;
    const out = normalizeMathExamOcrText(applyEducationSymbolLexicon(raw));
    expect(out).toMatch(/直角△AOB/);
    expect(out).toMatch(/等边△DEF/);
    expect(out).toMatch(/∠EFO/);
    expect(out).toMatch(/本小题/);
    expect(out).toMatch(/顶点D在第二象限/);
  });

  it("fixes boxed OCR issues: 如图O, 顶E, DEF vertex E, drops bottom gibberish", () => {
    const raw = `(24)在平面直角坐标系中，O为原点，直角△AOB的顶
DEF 的顶点 (0, 3) , F(-√3 , 0) , 顶点D在第二象限。
(1) 如图O，∠EFO的度数为____°，点 D 的坐标为: ______
(2) 对应点分别为D', E', F'. 设EE'=t。
得到钟面积为8 .
FE F'GH, RASA 的式子表示S ，并直接写出的
extac Sn, RS 的取值范围
A A
D E pt
F Bx`;
    const out = normalizeMathExamOcrText(applyEducationSymbolLexicon(raw));
    expect(out).toMatch(/如图①/);
    expect(out).toMatch(/顶点E\(0,3\)|顶点E\(0,\s*3\)/);
    expect(out).toMatch(/△AOB的顶点/);
    expect(out).not.toMatch(/extac|RASA|F Bx/i);
    expect(out).not.toMatch(/^A A$/m);
  });

  it("fixes 40,5 and 5(0,3) coord glitches from paddle", () => {
    const raw = `在平面直角坐标系中，直角△AOB的顶点40,5)，B(5V3,0)，等边△DEF的顶点5(0,3)，F(-√3,0)。CID平移`;
    const out = normalizeMathExamOcrText(applyEducationSymbolLexicon(raw));
    expect(out).toMatch(/A\(0,5\)/);
    expect(out).toMatch(/E\(0,3\)/);
    expect(out).toMatch(/\(2\)/);
  });

  it("fixes 直角A408 without spaces before triangle letters", () => {
    const raw = `在平面直角坐标系中，直角A408的顶点A(0,5)，等边A DEF顶点E(0,3)。CI)平移`;
    const out = normalizeMathExamOcrText(applyEducationSymbolLexicon(raw));
    expect(out).toMatch(/直角△AOB/);
    expect(out).toMatch(/\(2\)/);
  });

  it("full pipeline keeps triangle vertex letters in coordinate context", () => {
    const out = normalizeMathExamOcrText(applyEducationSymbolLexicon(SNIPPET));
    expect(out).toMatch(/直角△A[A-Z]{2,3}/);
    expect(out).not.toMatch(/直角△ABC/);
  });

  it("assessOcrExtractQuality flags gibberish", () => {
    const q = assessOcrExtractQuality(
      `${SNIPPET}\nwk FHAAETS BUSUADEF MEASUND SERMSAY A08 MESH`,
    );
    expect(q.tier).not.toBe("ok");
    expect(q.reasons.length).toBeGreaterThan(0);
  });

  it("fixes 顶点4(0,5) misread as A coordinate", () => {
    const raw = "在平面直角坐标系中，直角△AOB的顶点4(0,5)，B(5√3,0)";
    const out = normalizeCoordinatePlaneOcrText(raw);
    expect(out).toMatch(/顶点A\(0,5\)/);
  });

  it("strips mixed CJK+latin garbage tokens from gateway-like line", () => {
    const raw =
      "OnE®, FX DF , BADEF △AOB 正登部分为四边形 ZEE'A'G'时, 试用含有的式子表示SS";
    const out = normalizeCoordinatePlaneOcrText(
      `在平面直角坐标系中，O为原点。\n${raw}`,
    );
    expect(out).not.toMatch(/OnE®|BADEF|ZEE'A'G/);
  });

  it("fixes 500,3 when browser OCR drops 坐标系 keyword but keeps coordinate geometry cues", () => {
    const browserLike = `(22) O为原点，直角△AOB顶点A(0,5)，等边△DEF顶点E500,3)，F(-√3,0)。`;
    const out = normalizeCoordinatePlaneOcrText(browserLike);
    expect(out).toMatch(/E\(0,3\)/);
  });

  it("flattens tabular and strips frac/dot LaTeX spam", () => {
    const tab =
      "\\begin{tabular}{|c|}\n\\hline (4) 估计 \\(\\sqrt{37}-1\\) 的值在 \\\\\n\\hline A 3 和 4 之间 \\\\\n\\end{tabular}";
    const flat = flattenGotOcrTabularMarkup(tab);
    expect(flat).not.toContain("\\begin{tabular}");
    expect(flat).toContain("(4)");
    const fracSpam = "填空____" + String.raw`\(\frac{1}{2}\)`.repeat(20);
    expect(stripGotOcrLatexInlineSpam(fracSpam)).toBe("填空____");
    const dotSpam = "坐标为____" + String.raw`\(\cdot\)`.repeat(30);
    expect(stripGotOcrLatexInlineSpam(dotSpam)).toBe("坐标为____");
  });

  it("stripGotOcrPageHallucinations normalizes MCQ markers and splits merged stems", () => {
    const raw =
      "符合题目要求的)(1) 右图是立体 (2) 下列图形是中心对称\nA \\(0.05\\)\nB \\(0.5\\)";
    const out = stripGotOcrPageHallucinations(raw);
    expect(out).toMatch(/符合题目要求的\)\s*\n\n\(1\)/);
    expect(out).toMatch(/\(A\)\s*\\?\(/);
    expect(out).toMatch(/\(B\)\s*\\?\(/);
  });

  it("normalizeGotOcrMcqOptionMarkers prefixes (A)-(D)", () => {
    const out = normalizeGotOcrMcqOptionMarkers("A \\(5\\)\nB \\(6\\)");
    expect(out).toContain("(A)");
    expect(out).toContain("(B)");
    expect(normalizeGotOcrMcqOptionMarkers("6 和 7 之间 A 3 和 4")).toContain(
      "之间 (A) 3",
    );
  });

  it("strips full-page (1)题(2)…(N) enumeration runaway after MCQ options", () => {
    const head =
      "(D) \\(50 \\times 10^{3}\\)\n\n![附图](/import-figures/x.png)";
    const garbage = " (1) 题" + "(2)(3)(4)(5)".repeat(80) + "(354)(355)(356)";
    const raw = head + garbage;
    const out = stripGotOcrEnumeratedParenthesisRunaway(raw);
    expect(out).toContain("50 \\times 10^{3}");
    expect(out).not.toMatch(/\(354\)/);
    expect(out).toContain("![附图]");
  });

  it("canonicalization strips exam title and 2B pencil LaTeX noise", () => {
    const raw =
      "\\title{\n第 I 卷\n}\n用 \\(2 \\mathrm{~B}\\) 铅笔涂黑。\n(1) 右图是一个立体图形";
    const { text } = runEducationalTextCanonicalization(raw);
    expect(text).not.toContain("\\title");
    expect(text).toContain("2B");
    expect(text).not.toContain("\\mathrm");
  });

  it("strips GOT-OCR diagram axis label runaway after 图(1) 图(2)", () => {
    const stem =
      "（24）在平面直角坐标系中，O为原点。(2)当 \\frac{\\sqrt{3}}{2} \\leqslant t 时，求 S 的取值范围（直接写出结果即可）. 图(1) 图(2)";
    const garbage =
      String.raw`\(\mathrm{B} \overline{\mathrm{x}}\)\(\mathrm{D}\)\(\mathrm{F}\)\(\mathrm{G}\)` +
      String.raw`\(\mathrm{F}^{\prime \prime}\)\(\mathrm{D}^{\prime \prime}\)\(\mathrm{G}^{\prime \prime}\)`.repeat(
        40,
      );
    const fig = "\n![第1题示意图](/import-figures/x.png)";
    const raw = stem + garbage + fig;
    const out = normalizeMathExamOcrText(applyEducationSymbolLexicon(raw));
    expect(out).toMatch(/图[①②]/);
    expect(out).not.toMatch(/\\mathrm\{F\}\^\{\\prime/);
    expect(out).toContain("![第1题示意图]");
    expect(stripGotOcrDiagramLabelRunaway(raw).length).toBeLessThan(raw.length / 2);
  });

  it("fixes E(0,3) misread as 500,3 and drops gibberish lines", () => {
    const raw = `${SNIPPET}
顶点E500,3)，F(-√3,0)。
DEF wk FHAAETS MEASUND BHADEF ΔAOB MESH
(2) 将△DEF沿x轴正方向平移`;
    const out = normalizeCoordinatePlaneOcrText(raw);
    expect(out).toMatch(/E\(0,3\)/);
    expect(out).not.toMatch(/FHAAETS/);
    expect(out).not.toMatch(/MEASUND/);
  });
});
