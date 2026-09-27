import { describe, expect, it } from "vitest";
import { summarizeIndependentSentiment } from "../src/lib/sentiment";

describe("independent sentiment", () => {
  it("keeps agency, paid, unknown and unclassified records out of the classified denominator", () => {
    const items = [
      { id: "p", affiliation: "independent" }, { id: "n", affiliation: "independent" },
      { id: "m", affiliation: "independent" }, { id: "u", affiliation: "independent" },
      { id: "missing", affiliation: "independent" }, { id: "agency", affiliation: "agency" },
      { id: "paid", affiliation: "paid_disclosed" }, { id: "unknown", affiliation: "unknown" },
    ];
    const reviews = [
      { item_id: "p", label: "positive" }, { item_id: "n", label: "neutral" },
      { item_id: "m", label: "mixed" }, { item_id: "u", label: "unclassified" },
      { item_id: "agency", label: "positive" }, { item_id: "paid", label: "positive" },
      { item_id: "unknown", label: "positive" },
    ];
    expect(summarizeIndependentSentiment(items, reviews)).toEqual({
      counts: { positive: 1, negative: 0, neutral: 1, mixed: 1, unclassified: 1, unreviewed: 1 },
      classified: 3, independentItems: 5, excludedAgencyOrPaid: 2, unknownAffiliation: 1,
      positiveShare: 1 / 3,
    });
  });

  it("shows no rate when there are no classified independent records", () => {
    expect(summarizeIndependentSentiment([{ id: "x", affiliation: "independent" }], [])).toMatchObject({
      classified: 0, positiveShare: null, counts: { unreviewed: 1 },
    });
  });
});
