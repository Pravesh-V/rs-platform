import { describe, expect, it } from "vitest";
import { summarizeSearchCohorts, type SearchObservation } from "../src/lib/search-metrics";

const observation = (id: string, keywordId: string, outcome: SearchObservation["outcome"], observedAt: string,
  overrides: Partial<SearchObservation> = {}): SearchObservation => ({ id, keyword_id: keywordId, outcome,
  observed_at: observedAt, wave_label: "September", source_provider: "Manual Google Search",
  sampling_method: "manual_serp", result_type: "organic", ...overrides });

describe("manual search cohort summary", () => {
  it("uses only the latest outcome for each keyword and reports an exact denominator", () => {
    const rows = [observation("a","k1","not_found","2026-09-01T00:00:00Z"),
      observation("b","k1","present","2026-09-02T00:00:00Z"),
      observation("c","k2","not_found","2026-09-02T00:00:00Z")];
    expect(summarizeSearchCohorts(["k1","k2"],rows)[0]).toMatchObject({
      planned:2,attempted:2,present:1,notFound:1,errors:0,missing:0,presenceRate:0.5,
    });
  });
  it("withholds rates for missing keywords or errors and separates different sampling conditions", () => {
    const rows = [observation("a","k1","present","2026-09-01T00:00:00Z"),
      observation("b","k2","error","2026-09-02T00:00:00Z"),
      observation("c","k1","present","2026-09-02T00:00:00Z",{result_type:"ai_summary"}),
      observation("d","k2","present","2026-09-02T00:00:00Z",{source_provider:"Other provider"})];
    const summaries = summarizeSearchCohorts(["k1","k2"],rows);
    expect(summaries).toHaveLength(3);
    expect(summaries.find((row) => row.resultType==="organic" && row.sourceProvider==="Manual Google Search"))
      .toMatchObject({attempted:2,errors:1,presenceRate:null});
    expect(summaries.find((row) => row.resultType==="ai_summary"))
      .toMatchObject({attempted:1,missing:1,presenceRate:null});
  });
});
