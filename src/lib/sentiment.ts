export type SentimentItem = { id: string; affiliation: string };
export type SentimentReview = { item_id: string; label: string };

export function summarizeIndependentSentiment(items: SentimentItem[], reviews: SentimentReview[]) {
  const latest = new Map(reviews.map((review) => [review.item_id, review.label]));
  const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0, unclassified: 0, unreviewed: 0 };
  let excludedAgencyOrPaid = 0;
  let unknownAffiliation = 0;
  for (const item of items) {
    if (["agency", "brand", "paid_disclosed"].includes(item.affiliation)) { excludedAgencyOrPaid++; continue; }
    if (item.affiliation !== "independent") { unknownAffiliation++; continue; }
    const label = latest.get(item.id);
    if (label && label in counts && label !== "unreviewed") counts[label as keyof typeof counts]++;
    else counts.unreviewed++;
  }
  const classified = counts.positive + counts.negative + counts.neutral + counts.mixed;
  return {
    counts, classified, independentItems: classified + counts.unclassified + counts.unreviewed,
    excludedAgencyOrPaid, unknownAffiliation,
    positiveShare: classified ? counts.positive / classified : null,
  };
}
