export type AnswerRun = { id: string; outcome: "valid" | "refusal" | "error" };
export type AnswerReview = { run_id: string; version: number; mentions_client: boolean; recommends_client: boolean };
export type AnswerCitation = { run_id: string; url: string };

export function isRedditCitation(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "reddit.com" || parsed.hostname.endsWith(".reddit.com") || parsed.hostname === "redd.it");
  } catch { return false; }
}

export function summarizeAnswerCohort(
  promptCount: number, plannedRepeats: number, runs: AnswerRun[], reviews: AnswerReview[], citations: AnswerCitation[],
) {
  const latestReviews = new Map<string, AnswerReview>();
  for (const review of reviews) {
    const current = latestReviews.get(review.run_id);
    if (!current || review.version > current.version) latestReviews.set(review.run_id, review);
  }
  const redditCitedRuns = new Set(citations.filter((citation) => isRedditCitation(citation.url)).map((citation) => citation.run_id));
  const validRuns = runs.filter((run) => run.outcome === "valid");
  const reviewedRuns = validRuns.filter((run) => latestReviews.has(run.id));
  const unreviewedValid = validRuns.length - reviewedRuns.length;
  const mentioned = reviewedRuns.filter((run) => latestReviews.get(run.id)?.mentions_client).length;
  const recommended = reviewedRuns.filter((run) => latestReviews.get(run.id)?.recommends_client).length;
  const redditCited = validRuns.filter((run) => redditCitedRuns.has(run.id)).length;
  return {
    planned: promptCount * plannedRepeats,
    attempted: runs.length,
    valid: validRuns.length,
    errors: runs.filter((run) => run.outcome === "error").length,
    refusals: runs.filter((run) => run.outcome === "refusal").length,
    reviewedValid: reviewedRuns.length,
    unreviewedValid,
    mentioned,
    recommended,
    redditCited,
    mentionRate: validRuns.length && !unreviewedValid ? mentioned / validRuns.length : null,
    recommendationRate: validRuns.length && !unreviewedValid ? recommended / validRuns.length : null,
    redditSourceRate: validRuns.length ? redditCited / validRuns.length : null,
  };
}
