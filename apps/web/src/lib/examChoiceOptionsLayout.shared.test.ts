import { describe, expect, it } from "vitest";
import { CHOICE_OPTIONS_LAYOUT } from "@/config/examDomain";
import {
  layoutWeightForChoiceOption,
  resolveExamChoiceOptionsLayout,
  resolveExamFigureChoicesComposition,
} from "@/lib/examChoiceOptionsLayout.shared";

describe("resolveExamChoiceOptionsLayout", () => {
  it("keeps short english options inline when beside figure", () => {
    expect(
      resolveExamChoiceOptionsLayout(
        ["20 minutes", "40 minutes", "1 hour", "2 hours"],
        CHOICE_OPTIONS_LAYOUT,
        { shareRowWithFigure: true },
      ),
    ).toBe("inline");
  });

  it("无附图并排：短公式/数字四选一保持单行（均分铺满，勿误成双列）", () => {
    const digits = ["$1$", "$2$", "$3$", "$4$"];
    const radicals = ["$4\\sqrt{2}$", "$3\\sqrt{2}$", "$2\\sqrt{2}$", "$5\\sqrt{2}$"];
    expect(
      resolveExamChoiceOptionsLayout(digits, CHOICE_OPTIONS_LAYOUT, {
        shareRowWithFigure: false,
      }),
    ).toBe("inline");
    expect(
      resolveExamChoiceOptionsLayout(radicals, CHOICE_OPTIONS_LAYOUT, {
        shareRowWithFigure: false,
      }),
    ).toBe("inline");
    expect(CHOICE_OPTIONS_LAYOUT.noBesideInlineDistribute).toBe(true);
  });

  it("uses columns for longer chinese + latex options when over noBeside inline budget", () => {
    const opts = [
      "拉力做的有用功等于物体重力做功时 $W_1 = W_2$ 且成立",
      "拉力的功率比较结果为 $P_1 > P_2$ 的正确说法",
      "拉力做的额外功满足 $W_{外1} = W_{外2}$ 的条件",
      "机械效率关系为 $\\eta_1 < \\eta_2$ 的正确选项",
    ];
    expect(layoutWeightForChoiceOption(opts[0]!)).toBeGreaterThan(14);
    expect(
      resolveExamChoiceOptionsLayout(opts, CHOICE_OPTIONS_LAYOUT, {
        shareRowWithFigure: false,
      }),
    ).toBe("columns");
  });

  it("stacks when any option has a newline", () => {
    expect(
      resolveExamChoiceOptionsLayout(["短", "短", "第一行\n第二行", "短"]),
    ).toBe("stacked");
  });
});

describe("resolveExamFigureChoicesComposition", () => {
  it("places compact formula options beside a figure (options left, figure right)", () => {
    const opts = [
      "拉力做的有用功 $W_1 = W_2$",
      "拉力的功率 $P_1 > P_2$",
      "拉力做的额外功 $W_{外1} = W_{外2}$",
      "机械效率 $\\eta_1 < \\eta_2$",
    ];
    expect(resolveExamFigureChoicesComposition(true, opts)).toBe("beside");
  });

  it("stacks long options above figure", () => {
    const long = "这是一段很长的选项说明文字用来触发纵向布局避免与附图并排造成拥挤";
    const opts = [long, long, long, long];
    expect(resolveExamFigureChoicesComposition(true, opts)).toBe("stacked");
  });

  it("keeps stacked when there is no figure", () => {
    expect(resolveExamFigureChoicesComposition(false, ["A", "B", "C", "D"])).toBe(
      "stacked",
    );
  });
});
