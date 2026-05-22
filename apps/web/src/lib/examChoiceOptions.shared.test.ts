import { describe, expect, it } from "vitest";

import { stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";

describe("examChoiceOptions.shared", () => {
  it("stripLeadingChoiceMarker removes (A) / （B） and letter-dot prefixes", () => {
    expect(stripLeadingChoiceMarker("(A) $0.05\\times 10^6$")).toBe("$0.05\\times 10^6$");
    expect(stripLeadingChoiceMarker("（C） 答案")).toBe("答案");
    expect(stripLeadingChoiceMarker("A. (A) 文本")).toBe("文本");
    expect(stripLeadingChoiceMarker("B．xx")).toBe("xx");
  });

  it("does not strip (10) style numeric parens at start", () => {
    expect(stripLeadingChoiceMarker("(10) 是偶数")).toBe("(10) 是偶数");
  });
});
