import { describe, expect, it } from "vitest";
import { isRedditCitation, summarizeAnswerCohort } from "../src/lib/ai-visibility";

describe("manual AI visibility cohorts", () => {
  it("counts each valid answer once despite duplicate Reddit citations", () => {
    const result = summarizeAnswerCohort(2, 3,
      [{ id: "a", outcome: "valid" }, { id: "b", outcome: "valid" }, { id: "c", outcome: "error" }],
      [{ run_id: "a", version: 1, mentions_client: false, recommends_client: false },
       { run_id: "a", version: 2, mentions_client: true, recommends_client: false },
       { run_id: "b", version: 1, mentions_client: true, recommends_client: true }],
      [{ run_id: "a", url: "https://www.reddit.com/r/tools/comments/1" },
       { run_id: "a", url: "https://redd.it/1" },
       { run_id: "b", url: "https://reddit.com.evil.example/foo" }]);
    expect(result).toMatchObject({ planned: 6, attempted: 3, valid: 2, errors: 1, reviewedValid: 2,
      mentioned: 2, recommended: 1, redditCited: 1, mentionRate: 1, recommendationRate: 0.5, redditSourceRate: 0.5 });
  });

  it("withholds mention rates until all valid answers are reviewed", () => {
    expect(summarizeAnswerCohort(2, 1, [{ id: "a", outcome: "valid" }], [], [])).toMatchObject({
      valid: 1, unreviewedValid: 1, mentionRate: null, recommendationRate: null, redditSourceRate: 0,
    });
  });

  it("accepts only actual HTTPS Reddit domains", () => {
    expect(isRedditCitation("https://old.reddit.com/r/tools/comments/1")).toBe(true);
    expect(isRedditCitation("http://reddit.com/r/tools")).toBe(false);
    expect(isRedditCitation("https://reddit.com.evil.example/x")).toBe(false);
  });
});
