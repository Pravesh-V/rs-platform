export type Observation = { item_id: string; observed_at: string; views: number | null; score: number | null; replies: number | null; shares: number | null };

export type PeriodSummary = { latestViews: number | null; measuredItems: number; itemCount: number; snapshots: number };

export function latestByItem(observations: Observation[], start: string, endExclusive: string) {
  const latest = new Map<string, Observation>();
  for (const row of observations) {
    if (row.observed_at < start || row.observed_at >= endExclusive) continue;
    const old = latest.get(row.item_id);
    if (!old || old.observed_at < row.observed_at) latest.set(row.item_id, row);
  }
  return latest;
}

export function summarize(observations: Observation[], start: string, endExclusive: string): PeriodSummary {
  const inPeriod = observations.filter((row) => row.observed_at >= start && row.observed_at < endExclusive);
  const latest = latestByItem(observations, start, endExclusive);
  const known = [...latest.values()].filter((row) => row.views !== null);
  return { latestViews: known.length ? known.reduce((sum, row) => sum + row.views!, 0) : null, measuredItems: known.length, itemCount: latest.size, snapshots: inPeriod.length };
}

export function matchedViewChange(observations: Observation[], baseline: [string,string], comparison: [string,string]) {
  const before = latestByItem(observations, ...baseline);
  const after = latestByItem(observations, ...comparison);
  let beforeTotal = 0;
  let afterTotal = 0;
  let matchedItems = 0;
  for (const [id, old] of before) {
    const current = after.get(id);
    if (old.views === null || !current || current.views === null) continue;
    beforeTotal += old.views;
    afterTotal += current.views;
    matchedItems++;
  }
  return matchedItems ? { matchedItems, beforeTotal, afterTotal, change: afterTotal - beforeTotal } : null;
}

export function contributionGroups(
  contributions: { item_id: string; format: string }[],
  items: { id: string; subreddit: string }[],
  observations: Observation[],
  period: [string,string],
) {
  const itemMap = new Map(items.map((item) => [item.id,item]));
  const latest = latestByItem(observations,...period);
  const groups = new Map<string,{subreddit:string;format:string;contributions:number;observedItems:number;measuredItems:number;latestLifetimeViews:number|null}>();
  for (const contribution of contributions) {
    const item = itemMap.get(contribution.item_id);
    if (!item) continue;
    const key = JSON.stringify([item.subreddit,contribution.format]);
    const group = groups.get(key) ?? {subreddit:item.subreddit,format:contribution.format,contributions:0,observedItems:0,measuredItems:0,latestLifetimeViews:null};
    group.contributions++;
    const observation = latest.get(contribution.item_id);
    if (observation) {
      group.observedItems++;
      if (observation.views!==null) {
        group.measuredItems++;
        group.latestLifetimeViews=(group.latestLifetimeViews ?? 0)+observation.views;
      }
    }
    groups.set(key,group);
  }
  return [...groups.values()].sort((a,b) => a.subreddit.localeCompare(b.subreddit) || a.format.localeCompare(b.format));
}

export function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function compareRates(oldNumerator: number, oldDenominator: number, newNumerator: number, newDenominator: number) {
  const oldRate = rate(oldNumerator, oldDenominator);
  const newRate = rate(newNumerator, newDenominator);
  if (oldRate === null || newRate === null) return null;
  return {
    oldRate, newRate,
    qualifyingAnswerChange: newNumerator - oldNumerator,
    percentagePointChange: (newRate - oldRate) * 100,
    relativePercentChange: oldRate === 0 ? null : ((newRate - oldRate) / oldRate) * 100,
    rateMultiple: oldRate === 0 ? null : newRate / oldRate,
  };
}
