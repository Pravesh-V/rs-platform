import Link from "next/link";
import { addSearchKeyword, addSearchObservation, createSearchSet, freezeSearchSet } from "@/app/actions/search-visibility";
import { Shell } from "@/components/shell";
import { requireInternalClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";
import { compareSearchWaves, summarizeSearchCohorts, type SearchCohort, type SearchObservation } from "@/lib/search-metrics";

const rate = (cohort: SearchCohort | null) => cohort?.presenceRate === null || !cohort
  ? "Withheld" : `${(cohort.presenceRate * 100).toFixed(1)}%`;
const coverage = (cohort: SearchCohort | null) => cohort
  ? `${cohort.attempted}/${cohort.planned} attempted · ${cohort.errors} errors · ${cohort.missing} missing`
  : "No observations";

export default async function SearchVisibilityPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ set?: string; observation?: string; error?: string; fromWave?: string; toWave?: string }>;
}) {
  const { clientId } = await params;
  const filters = await searchParams;
  const { db, client, role } = await requireInternalClient(clientId);
  const { data: sets, count: setCount, error: setsError } = await retryIdempotentRequest(async () => db.from("search_sets")
    .select("id,name,version,engine,region,language,device,status,created_at",{count:"exact"}).eq("client_id",clientId)
    .order("created_at",{ascending:false}).limit(100));
  const selectedSet = sets?.find((set) => set.id===filters.set) ?? sets?.[0];
  const [{ data: keywords, error: keywordsError }, { data: observations, count: observationCount, error: observationsError }] = selectedSet ? await Promise.all([
    retryIdempotentRequest(async () => db.from("search_keywords").select("id,ordinal,phrase")
      .eq("client_id",clientId).eq("set_id",selectedSet.id).order("ordinal").limit(101)),
    retryIdempotentRequest(async () => db.from("search_observations")
      .select("id,keyword_id,wave_label,observed_at,source_provider,sampling_method,result_type,outcome,rank,ranking_url,result_title,detail,source_note",{count:"exact"})
      .eq("client_id",clientId).eq("set_id",selectedSet.id).order("observed_at",{ascending:false}).limit(500)),
  ]) : [{data:[],error:null},{data:[],count:0,error:null}];
  const selected = observations?.find((row) => row.id===filters.observation) ?? observations?.[0];
  const phraseFor = (id: string) => keywords?.find((keyword) => keyword.id===id)?.phrase ?? "Keyword unavailable";
  const capped = (setCount !== null && setCount > (sets?.length ?? 0)) || (keywords?.length ?? 0)>100
    || (observationCount !== null && observationCount > (observations?.length ?? 0));
  const canEdit = ["owner","manager","researcher"].includes(role);
  const loadError = setsError || keywordsError || observationsError;
  const cohorts = !loadError && !capped && keywords?.length && observations?.length
    ? summarizeSearchCohorts(keywords.map((row) => row.id),observations as SearchObservation[]) : [];
  const waves = [...new Set(cohorts.map((cohort) => cohort.waveLabel))].sort();
  const fromWave = waves.includes(filters.fromWave ?? "") ? filters.fromWave ?? "" : "";
  const toWave = waves.includes(filters.toWave ?? "") ? filters.toWave ?? "" : "";
  const changes = fromWave && toWave && fromWave !== toWave ? compareSearchWaves(cohorts,fromWave,toWave) : [];

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">SEARCH VISIBILITY · MANUAL EVIDENCE</div><h1>Keyword observations</h1><p className="muted">Track comparable search settings and observed result URLs for {client.name}.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to overview</Link></div>
    <div className="notice warning"><strong>No search provider is connected.</strong><p>These records are manually entered or copied from an authorized export. Search ranking and AI-summary appearance vary by location, device, account and time. A Search Console property for the client website cannot verify rankings of third-party Reddit URLs. An AI summary is kept separate from ordinary and paid results.</p></div>
    {filters.error && <div className="notice error" role="alert">{filters.error}</div>}
    {loadError && <div className="notice error" role="alert">Search evidence could not fully load. {loadError.message}</div>}
    {capped && <div className="notice warning">The current display limit was reached. This page does not calculate partial totals or rankings.</div>}

    {canEdit && <section className="panel"><div className="panel-heading"><div><h2>Create a fixed keyword set</h2><p className="muted small">Freeze the phrases and settings before observations. A changed set requires a new version.</p></div></div>
      <details className="add-detail"><summary>New keyword set</summary><form action={createSearchSet} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Name<input name="name" required maxLength={160} placeholder="Buying questions" /></label><label>Version<input name="version" type="number" required min={1} defaultValue={1} /></label>
        <label>Search engine or interface<input name="engine" required maxLength={80} placeholder="Google Search" /></label><label>Region<input name="region" required maxLength={80} placeholder="US" /></label>
        <label>Language<input name="language" required maxLength={40} defaultValue="en" /></label><label>Device<select name="device"><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
        <div className="form-actions"><button className="button primary">Create set</button></div>
      </form></details></section>}

    <div className="content-columns"><section className="panel"><div className="panel-heading"><h2>Sets and versions</h2></div>
      {sets?.length ? <div className="record-list content-list">{sets.slice(0,100).map((set) => <Link key={set.id} href={`?set=${set.id}`} className={`draft-row${selectedSet?.id===set.id ? " selected" : ""}`}><strong>{set.name} · v{set.version}</strong><span className="tag">{set.status}</span><span className="muted small">{set.engine} · {set.region} · {set.language} · {set.device}</span></Link>)}</div> : setsError ? <div className="empty compact">Sets unavailable.</div> : <div className="empty compact">No keyword sets yet.</div>}
    </section><section className="panel"><div className="panel-heading"><div><h2>{selectedSet ? `${selectedSet.name} · v${selectedSet.version}` : "Selected set"}</h2><p className="muted small">{selectedSet ? `${selectedSet.engine} · ${selectedSet.region} · ${selectedSet.language} · ${selectedSet.device}` : "Choose or create a set."}</p></div></div>
      {selectedSet && <><div className="record-list">{keywords?.length ? keywords.map((keyword) => <div className="record" key={keyword.id}><strong>{keyword.ordinal}. {keyword.phrase}</strong></div>) : <div className="empty compact">No keywords in this set.</div>}</div>
        {canEdit && selectedSet.status==="draft" && <><details className="add-detail"><summary>Add keyword</summary><form action={addSearchKeyword} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} />
          <label>Number<input name="ordinal" type="number" required min={1} max={100} defaultValue={(keywords?.length ?? 0)+1} /></label><label>Exact phrase<input name="phrase" required maxLength={300} /></label><div className="form-actions"><button className="button secondary">Add keyword</button></div>
        </form></details>{Boolean(keywords?.length) && <form action={freezeSearchSet} className="add-detail"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} /><button className="button primary">Freeze this set</button><p className="muted small">Frozen phrases and settings cannot be edited.</p></form>}</>}
      </>}
    </section></div>

    {selectedSet?.status==="frozen" && <section className="panel"><div className="panel-heading"><div><h2>Observed keyword coverage</h2><p className="muted small">Each row keeps one frozen set, wave, provider, collection method and result type. The latest recorded outcome per keyword is used.</p></div></div>
      {cohorts.length ? <div className="table-scroll"><table><thead><tr><th>Wave</th><th>Result type</th><th>Source and method</th><th>Attempted</th><th>Present</th><th>Not found</th><th>Errors</th><th>Missing</th><th>Presence</th></tr></thead><tbody>{cohorts.map((cohort) => <tr key={JSON.stringify([cohort.waveLabel,cohort.sourceProvider,cohort.samplingMethod,cohort.resultType])}><td>{cohort.waveLabel}</td><td>{cohort.resultType.replaceAll("_"," ")}</td><td>{cohort.sourceProvider} · {cohort.samplingMethod.replaceAll("_"," ")}</td><td>{cohort.attempted}/{cohort.planned}</td><td>{cohort.present}</td><td>{cohort.notFound}</td><td>{cohort.errors}</td><td>{cohort.missing}</td><td>{cohort.presenceRate===null ? "Withheld" : `${(cohort.presenceRate*100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
        : <div className="empty compact">{capped ? "Coverage withheld until the full observation set can be loaded." : "Record observations to see coverage by cohort."}</div>}
      <p className="coverage-note">Presence is shown only when every keyword has a valid present or explicit not-found outcome. A missing record is not a not-found result. This is a sampled search observation, not audience exposure or a cross-provider trend.</p>
    </section>}

    {selectedSet?.status==="frozen" && <section className="panel"><div className="panel-heading"><div><h2>Compare two waves</h2><p className="muted small">Choose the earlier and later observations yourself. Comparisons use this frozen keyword set and match the same provider, collection method and result type.</p></div></div>
      {waves.length >= 2 ? <form method="get" action={`/clients/${clientId}/search-visibility`} className="form-grid"><input type="hidden" name="set" value={selectedSet.id} />
        <label>Earlier wave<select name="fromWave" required defaultValue={fromWave}><option value="">Choose a wave</option>{waves.map((wave) => <option value={wave} key={wave}>{wave}</option>)}</select></label>
        <label>Later wave<select name="toWave" required defaultValue={toWave}><option value="">Choose a wave</option>{waves.map((wave) => <option value={wave} key={wave}>{wave}</option>)}</select></label>
        <div className="form-actions"><button className="button secondary">Compare waves</button></div>
      </form> : <div className="empty compact">Record at least two waves to compare them.</div>}
      {filters.fromWave && filters.toWave && !changes.length && waves.length >= 2 && <div className="notice warning">Choose two different recorded waves from this set.</div>}
      {changes.length > 0 && <div className="table-scroll"><table><thead><tr><th>Provider and method</th><th>Result type</th><th>Earlier coverage</th><th>Later coverage</th><th>Earlier presence</th><th>Later presence</th><th>Change</th></tr></thead><tbody>{changes.map((change) => <tr key={JSON.stringify([change.sourceProvider,change.samplingMethod,change.resultType])}><td>{change.sourceProvider} · {change.samplingMethod.replaceAll("_"," ")}</td><td>{change.resultType.replaceAll("_"," ")}</td><td>{coverage(change.baseline)}</td><td>{coverage(change.comparison)}</td><td>{rate(change.baseline)}</td><td>{rate(change.comparison)}</td><td>{change.presenceChangePoints === null ? "Withheld" : `${change.presenceChangePoints > 0 ? "+" : ""}${change.presenceChangePoints.toFixed(1)} pp`}</td></tr>)}</tbody></table></div>}
      <p className="coverage-note">A change is shown only when both waves have one valid latest outcome for every keyword under identical sampling conditions. Percentage points describe sampled presence, not traffic, causation or a persistent ranking.</p>
    </section>}

    {selectedSet?.status==="frozen" && <>{canEdit && <section className="panel"><div className="panel-heading"><div><h2>Add one observed result</h2><p className="muted small">Record one result URL or an explicit not-found/error outcome for a keyword and wave.</p></div></div>
      <details className="add-detail"><summary>New observation</summary><form action={addSearchObservation} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} />
        <label>Keyword<select name="keywordId" required>{keywords?.map((keyword) => <option key={keyword.id} value={keyword.id}>{keyword.ordinal}. {keyword.phrase}</option>)}</select></label><label>Wave label<input name="waveLabel" required maxLength={80} placeholder="2026-09 baseline" /></label>
        <label>Observed at<input name="observedAt" required placeholder="2026-09-27T12:00:00+05:30" /></label><label>Source provider/interface<input name="sourceProvider" required maxLength={120} placeholder="Manual Google Search" /></label>
        <label>Collection method<select name="samplingMethod"><option value="manual_serp">Manual search result</option><option value="authorized_export">Authorized export</option></select></label>
        <label>Result type<select name="resultType"><option value="organic">Ordinary organic result</option><option value="ai_summary">AI summary/overview</option><option value="advertisement">Advertisement</option></select></label>
        <label>Outcome<select name="outcome"><option value="present">Present</option><option value="not_found">Not found in sampled scope</option><option value="error">Collection error</option></select></label>
        <label>Rank, if ordinary result<input name="rank" type="number" min={1} max={100} placeholder="1–100" /></label>
        <label className="wide-field">Ranking or cited URL<input name="rankingUrl" type="url" maxLength={2000} placeholder="https://..." /></label>
        <label className="wide-field">Result title or summary label<input name="resultTitle" maxLength={500} /></label>
        <label className="wide-field">Absence/error detail<textarea name="detail" maxLength={2000} rows={2} placeholder="Required for not found or error; include checked depth for absence." /></label>
        <label className="wide-field">Source, sampling and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} placeholder="How, where and with what rights this result was observed" /></label>
        <div className="form-actions"><button className="button primary">Save observation</button></div>
      </form></details></section>}

      <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Recorded observations</h2><p className="muted small">Newest 500. No blended rank or AI-summary rate is calculated.</p></div></div>
        {observations?.length ? <div className="record-list content-list">{observations.slice(0,500).map((row) => <Link key={row.id} href={`?set=${selectedSet.id}&observation=${row.id}`} className={`draft-row${selected?.id===row.id ? " selected" : ""}`}><strong>{phraseFor(row.keyword_id)}</strong><span className="tag">{row.result_type.replaceAll("_"," ")} · {row.outcome.replaceAll("_"," ")}</span><span className="muted small">{row.wave_label} · {new Date(row.observed_at).toLocaleString("en")}</span></Link>)}</div> : observationsError ? <div className="empty compact">Observations unavailable.</div> : <div className="empty compact">No search observations recorded.</div>}
      </section><section className="panel"><div className="panel-heading"><h2>Source detail</h2></div>
        {selected ? <div className="draft-detail"><p><strong>Keyword:</strong> {phraseFor(selected.keyword_id)}</p><p><strong>Wave:</strong> {selected.wave_label} · {new Date(selected.observed_at).toLocaleString("en")}</p>
          <p><strong>Observation:</strong> {selected.result_type.replaceAll("_"," ")} · {selected.outcome.replaceAll("_"," ")}{selected.rank!==null ? ` · Rank ${selected.rank}` : ""}</p>
          {selected.result_title && <p><strong>Title:</strong> {selected.result_title}</p>}
          {selected.ranking_url && <p><a href={selected.ranking_url} target="_blank" rel="noreferrer">Open recorded URL ↗</a></p>}
          {selected.detail && <p><strong>Detail:</strong> {selected.detail}</p>}
          <p className="muted small">{selected.source_provider} · {selected.sampling_method.replaceAll("_"," ")} · {selected.source_note}</p>
          <p className="coverage-note">A recorded URL or rank reflects the stated sample at the stated time. It does not establish a persistent ranking or broad search exposure.</p>
        </div> : <div className="empty compact">Select an observation.</div>}
      </section></div></>}
  </Shell>;
}
