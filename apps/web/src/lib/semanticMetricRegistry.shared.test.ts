import { describe, expect, it } from "vitest";

import { SEMANTIC_RATE_PRESETS } from "@/lib/semanticLineageRate.shared";
import {
  SEMANTIC_METRIC_REGISTRY,
  formatMetricRegistryCatalog,
  listSemanticMetricDescriptors,
} from "@/lib/semanticMetricRegistry.shared";

describe("SEMANTIC_METRIC_REGISTRY", () => {
  it("every rate preset has registry descriptor with frozen semantics", () => {
    const ids = Object.keys(SEMANTIC_RATE_PRESETS);
    expect(ids.length).toBe(4);
    for (const id of ids) {
      const d = SEMANTIC_METRIC_REGISTRY[id as keyof typeof SEMANTIC_METRIC_REGISTRY];
      expect(d.numerator_semantics.length).toBeGreaterThan(20);
      expect(d.denominator_semantics.length).toBeGreaterThan(20);
      expect(d.population).not.toContain("exams_total");
    }
  });

  it("bind_refusal_rate population is authority evaluation cohort", () => {
    const d = SEMANTIC_METRIC_REGISTRY.bind_refusal_rate;
    expect(d.population).toBe("exams_with_authority_bind_evaluation");
    expect(d.kind).toBe("authority_availability");
  });

  it("catalog lists all metrics", () => {
    const cat = formatMetricRegistryCatalog();
    expect(cat).toContain("bind_refusal_rate");
    expect(listSemanticMetricDescriptors()).toHaveLength(4);
  });
});
