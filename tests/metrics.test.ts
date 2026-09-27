import { describe, expect, it } from "vitest";
import { compareRates, contributionGroups, matchedViewChange, summarize, type Observation } from "../src/lib/metrics";
import { periodBounds } from "../src/lib/data";

describe("metric definitions", () => {
  it("calculates the required 2/20 to 10/20 example", () => {
    expect(compareRates(2,20,10,20)).toEqual({ oldRate:.1,newRate:.5,qualifyingAnswerChange:8,percentagePointChange:40,relativePercentChange:400,rateMultiple:5 });
    expect(compareRates(0,20,10,20)?.relativePercentChange).toBeNull();
    expect(compareRates(0,0,10,20)).toBeNull();
  });

  it("uses the latest lifetime value, preserves unknown, and compares matched items", () => {
    const observations: Observation[] = [
      { item_id:"a",observed_at:"2026-01-03T10:00:00Z",views:100,score:2,replies:0,shares:null },
      { item_id:"a",observed_at:"2026-02-02T10:00:00Z",views:140,score:4,replies:1,shares:null },
      { item_id:"b",observed_at:"2026-02-04T10:00:00Z",views:null,score:null,replies:null,shares:null },
    ];
    expect(summarize(observations,"2026-02-01T00:00:00Z","2026-03-01T00:00:00Z")).toEqual({ latestViews:140,measuredItems:1,itemCount:2,snapshots:2 });
    expect(matchedViewChange(observations,["2026-01-01T00:00:00Z","2026-02-01T00:00:00Z"],["2026-02-01T00:00:00Z","2026-03-01T00:00:00Z"]))
      .toEqual({ matchedItems:1,beforeTotal:100,afterTotal:140,change:40 });
    expect(summarize(observations,"2026-03-01T00:00:00Z","2026-04-01T00:00:00Z").latestViews).toBeNull();
  });

  it("uses client-zone midnight across a daylight-saving change", () => {
    expect(periodBounds("2026-03-07","2026-03-08","America/New_York")).toEqual(["2026-03-07T05:00:00.000Z","2026-03-09T04:00:00.000Z"]);
  });

  it("groups campaign contributions without summing repeated lifetime counters or turning missing views into zero", () => {
    const observations: Observation[] = [
      {item_id:"a",observed_at:"2026-02-01T10:00:00Z",views:100,score:null,replies:null,shares:null},
      {item_id:"a",observed_at:"2026-02-02T10:00:00Z",views:140,score:null,replies:null,shares:null},
      {item_id:"b",observed_at:"2026-02-02T10:00:00Z",views:null,score:2,replies:null,shares:null},
      {item_id:"a",observed_at:"2026-03-02T10:00:00Z",views:999,score:null,replies:null,shares:null},
    ];
    expect(contributionGroups(
      [{item_id:"a",format:"post"},{item_id:"b",format:"post"},{item_id:"c",format:"comment"}],
      [{id:"a",subreddit:"tools"},{id:"b",subreddit:"tools"},{id:"c",subreddit:"other"}],
      observations,["2026-02-01T00:00:00Z","2026-03-01T00:00:00Z"],
    )).toEqual([
      {subreddit:"other",format:"comment",contributions:1,observedItems:0,measuredItems:0,latestLifetimeViews:null},
      {subreddit:"tools",format:"post",contributions:2,observedItems:2,measuredItems:1,latestLifetimeViews:140},
    ]);
  });
});
