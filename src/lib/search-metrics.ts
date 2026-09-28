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
export type SearchWaveComparison = {
  sourceProvider: string;
  samplingMethod: string;
  resultType: SearchResultType;
  baseline: SearchCohort | null;
  comparison: SearchCohort | null;
  presenceChangePoints: number | null;
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

export function compareSearchWaves(cohorts: SearchCohort[], baselineWave: string, comparisonWave: string): SearchWaveComparison[] {
  if (!baselineWave || !comparisonWave || baselineWave === comparisonWave) return [];
  const scopes = new Map<string, { baseline: SearchCohort | null; comparison: SearchCohort | null }>();
  for (const cohort of cohorts) {
    if (cohort.waveLabel !== baselineWave && cohort.waveLabel !== comparisonWave) continue;
    const scope = JSON.stringify([cohort.sourceProvider, cohort.samplingMethod, cohort.resultType]);
    const pair = scopes.get(scope) ?? { baseline: null, comparison: null };
    if (cohort.waveLabel === baselineWave) pair.baseline = cohort;
    else pair.comparison = cohort;
    scopes.set(scope, pair);
  }
  return [...scopes.entries()].map(([scope, pair]) => {
    const [sourceProvider, samplingMethod, resultType] = JSON.parse(scope) as [string, string, SearchResultType];
    const { baseline, comparison } = pair;
    return {
      sourceProvider, samplingMethod, resultType, baseline, comparison,
      presenceChangePoints: baseline?.presenceRate !== null && baseline?.presenceRate !== undefined
        && comparison?.presenceRate !== null && comparison?.presenceRate !== undefined
        && baseline.planned === comparison.planned
        ? (comparison.presenceRate - baseline.presenceRate) * 100 : null,
    };
  }).sort((a, b) => a.sourceProvider.localeCompare(b.sourceProvider)
    || a.samplingMethod.localeCompare(b.samplingMethod) || a.resultType.localeCompare(b.resultType));
}
