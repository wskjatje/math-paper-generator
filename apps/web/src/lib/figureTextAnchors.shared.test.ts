import { describe, expect, it } from "vitest";

import {
  extractMarkdownImageUrlsFromContent,
  scanQuestionContentForFigureTextAnchors,
} from "@/lib/figureTextAnchors.shared";

describe("figureTextAnchors (debug scan)", () => {
  it("扫描 如图① / 图② / 图9 等锚点", () => {
    const s =
      "（I）如图①，求角；\n（II）① 如图②，阴影面积。\n(4) 图9显示了一个几何图形。";
    expect(scanQuestionContentForFigureTextAnchors(s)).toEqual([
      "如图①",
      "如图②",
      "图9",
    ]);
  });

  it("STEP 2B：扫描 如图O / 图ABC / 独立 图A（排除 地图…）", () => {
    const s = "如图O所示，参考图ABC。另见图A。地图B为干扰。";
    expect(scanQuestionContentForFigureTextAnchors(s)).toEqual(["如图O", "图ABC", "图A"]);
  });

  it("提取 Markdown 插图 URL", () => {
    const s = "见 ![]( /a/b.png ) 与 ![x](https://x/y.jpg \"t\")";
    expect(extractMarkdownImageUrlsFromContent(s)).toEqual(["/a/b.png", "https://x/y.jpg"]);
  });
});
