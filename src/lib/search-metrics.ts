export type SearchOutcome = "present" | "not_found" | "error";
export type SearchResultType = "organic" | "ai_summary" | "advertisement";
export type SearchObservation = {
  id: string;
  keyword_id: string;
  wave_label: string;
  source_provider: string;
  sampling_method: string;
  result_type: SearchResultType;
  outcome: SearchOutcome;
  observed_at: string;
};
export type SearchCohort = {
  waveLabel: string;
  sourceProvider: string;
  samplingMethod: string;
  resultType: SearchResultType;
  latestObservedAt: string;
  planned: number;
  attempted: number;
  present: number;
  notFound: number;
  errors: number;
  missing: number;
  presenceRate: number | null;
};

function key(row: SearchObservation): string {
  return JSON.stringify([row.wave_label,row.source_provider,row.sampling_method,row.result_type]);
}

export function summarizeSearchCohorts(keywordIds: string[], observations: SearchObservation[]): SearchCohort[] {
  const known = new Set(keywordIds);
  const latest = new Map<string, SearchObservation>();
  for (const row of observations) {
    if (!known.has(row.keyword_id)) continue;
    const entryKey = `${key(row)}:${row.keyword_id}`;
    const previous = latest.get(entryKey);
    if (!previous || row.observed_at > previous.observed_at
      || (row.observed_at === previous.observed_at && row.id > previous.id)) latest.set(entryKey,row);
  }
  const groups = new Map<string, SearchObservation[]>();
  for (const row of latest.values()) {
    const groupKey = key(row);
    groups.set(groupKey,[...(groups.get(groupKey) ?? []),row]);
  }
  return [...groups.entries()].map(([groupKey, rows]) => {
    const [waveLabel,sourceProvider,samplingMethod,resultType] = JSON.parse(groupKey) as [string,string,string,SearchResultType];
    const present = rows.filter((row) => row.outcome==="present").length;
    const notFound = rows.filter((row) => row.outcome==="not_found").length;
    const errors = rows.filter((row) => row.outcome==="error").length;
    const missing = Math.max(0,known.size-rows.length);
    return { waveLabel,sourceProvider,samplingMethod,resultType,
      latestObservedAt: rows.reduce((latestAt,row) => row.observed_at>latestAt ? row.observed_at : latestAt,""),
      planned: known.size, attempted: rows.length, present,notFound,errors,missing,
      presenceRate: known.size>0 && missing===0 && errors===0 ? present/known.size : null };
  }).sort((a,b) => b.latestObservedAt.localeCompare(a.latestObservedAt)
    || a.waveLabel.localeCompare(b.waveLabel) || a.resultType.localeCompare(b.resultType));
}
