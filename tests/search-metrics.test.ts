import { describe, expect, it } from "vitest";
import { compareSearchWaves, summarizeSearchCohorts, type SearchObservation } from "../src/lib/search-metrics";

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
  it("compares only complete waves with identical provider, method and result type", () => {
    const rows = [
      observation("a","k1","not_found","2026-09-01T00:00:00Z",{wave_label:"baseline"}),
      observation("b","k2","present","2026-09-01T00:00:00Z",{wave_label:"baseline"}),
      observation("c","k1","present","2026-10-01T00:00:00Z",{wave_label:"comparison"}),
      observation("d","k2","present","2026-10-01T00:00:00Z",{wave_label:"comparison"}),
      observation("e","k1","present","2026-09-01T00:00:00Z",{wave_label:"baseline",source_provider:"Different provider"}),
      observation("f","k1","present","2026-10-01T00:00:00Z",{wave_label:"comparison",result_type:"ai_summary"}),
    ];
    const changes = compareSearchWaves(summarizeSearchCohorts(["k1","k2"],rows),"baseline","comparison");
    expect(changes).toHaveLength(3);
    expect(changes.find((row) => row.sourceProvider === "Manual Google Search" && row.resultType === "organic"))
      .toMatchObject({presenceChangePoints:50,baseline:{presenceRate:0.5},comparison:{presenceRate:1}});
    expect(changes.filter((row) => row.sourceProvider === "Different provider" || row.resultType === "ai_summary")
      .every((row) => row.presenceChangePoints === null)).toBe(true);
  });
  it("withholds a wave change when either wave has an error or missing keyword", () => {
    const rows = [
      observation("a","k1","present","2026-09-01T00:00:00Z",{wave_label:"baseline"}),
      observation("b","k2","error","2026-09-01T00:00:00Z",{wave_label:"baseline"}),
      observation("c","k1","present","2026-10-01T00:00:00Z",{wave_label:"comparison"}),
    ];
    const [change] = compareSearchWaves(summarizeSearchCohorts(["k1","k2"],rows),"baseline","comparison");
    expect(change).toMatchObject({presenceChangePoints:null,baseline:{errors:1},comparison:{missing:1}});
  });
});
