import Link from "next/link";
import { addPrompt, createPromptSet, freezePromptSet, recordManualAnswer, reviewManualAnswer } from "@/app/actions/ai-visibility";
import { Shell } from "@/components/shell";
import { requireClient } from "@/lib/auth";
import { summarizeAnswerCohort } from "@/lib/ai-visibility";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

type Run = {
  id: string; prompt_id: string; wave_label: string; provider: string; model_label: string;
  collection_method: string; config_note: string; repeat_no: number; observed_at: string;
  outcome: "valid" | "refusal" | "error"; answer_text: string | null; error_note: string | null; source_note: string;
};
function keyFor(run: Run) {
  return JSON.stringify([run.wave_label, run.provider, run.model_label, run.collection_method, run.config_note]);
}
function rate(value: number | null) { return value === null ? "Not ready" : `${(value * 100).toFixed(1)}%`; }

export default async function AiVisibility({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ set?: string; cohort?: string; run?: string; error?: string }>;
}) {
  const { clientId } = await params;
  const filters = await searchParams;
  const { db, client, role } = await requireClient(clientId);
  const { data: sets, error: setsError } = await retryIdempotentRequest(async () => db.from("ai_prompt_sets")
    .select("id,name,version,language,region,planned_repeats,status,frozen_at,created_at")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(100));
  const selectedSet = sets?.find((set) => set.id === filters.set) ?? sets?.[0];
  const [{ data: prompts, error: promptsError }, { data: allRuns, error: runsError }] = selectedSet ? await Promise.all([
    retryIdempotentRequest(async () => db.from("ai_prompts").select("id,ordinal,buyer_stage,branded,question").eq("client_id",clientId).eq("prompt_set_id",selectedSet.id).order("ordinal").limit(101)),
    retryIdempotentRequest(async () => db.from("ai_answer_runs").select("id,prompt_id,wave_label,provider,model_label,collection_method,config_note,repeat_no,observed_at,outcome,answer_text,error_note,source_note")
      .eq("client_id",clientId).eq("prompt_set_id",selectedSet.id).order("observed_at",{ ascending:false }).limit(501)),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const runs = (allRuns ?? []) as Run[];
  const cohorts = [...new Set(runs.map(keyFor))];
  const selectedCohort = cohorts.includes(filters.cohort ?? "") ? filters.cohort! : cohorts[0];
  const cohortRuns = runs.filter((run) => keyFor(run) === selectedCohort);
  const runIds = cohortRuns.map((run) => run.id);
  const capped = (prompts?.length ?? 0) > 100 || runs.length > 500 || cohortRuns.length > 100;
  const [{ data: citations, error: citationsError }, { data: reviews, error: reviewsError }] = runIds.length && !capped ? await Promise.all([
    retryIdempotentRequest(async () => db.from("ai_citations").select("id,run_id,ordinal,url").eq("client_id",clientId).in("run_id",runIds).order("ordinal").limit(2001)),
    retryIdempotentRequest(async () => db.from("ai_answer_reviews").select("id,run_id,version,mentions_client,recommends_client,review_note,reviewed_at").eq("client_id",clientId).in("run_id",runIds).order("version",{ ascending:false }).limit(1001)),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const historyCapped = (citations?.length ?? 0) > 2000 || (reviews?.length ?? 0) > 1000;
  const complete = !capped && !historyCapped && !setsError && !promptsError && !runsError && !citationsError && !reviewsError;
  const summary = complete && selectedSet && prompts && citations && reviews
    ? summarizeAnswerCohort(prompts.length, selectedSet.planned_repeats, cohortRuns, reviews, citations) : null;
  const selectedRun = cohortRuns.find((run) => run.id === filters.run) ?? cohortRuns[0];
  const selectedPrompt = prompts?.find((prompt) => prompt.id === selectedRun?.prompt_id);
  const selectedCitations = citations?.filter((citation) => citation.run_id === selectedRun?.id) ?? [];
  const selectedReviews = reviews?.filter((review) => review.run_id === selectedRun?.id).sort((a,b) => b.version-a.version) ?? [];
  const latestReview = selectedReviews[0];
  const canEdit = ["owner", "manager", "researcher"].includes(role);
  const canReview = ["owner", "manager", "reviewer"].includes(role);
  const loadError = setsError || promptsError || runsError || citationsError || reviewsError;

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">AI VISIBILITY · MANUAL EVIDENCE</div><h1>Prompt tests &amp; citations</h1><p className="muted">Record exact questions and supplied answers for {client.name}.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to overview</Link></div>
    <div className="notice warning"><strong>No AI provider is connected.</strong><p>Every result here must be entered from a source you are permitted to store. Provider, model, search mode, region and collection method are supplied labels, not verified API metadata. Consumer-interface samples are separate from API exports. A cited Reddit thread is not proof that an agency comment was used.</p></div>
    {filters.error && <div className="notice error" role="alert">{filters.error}</div>}
    {loadError && <div className="notice error" role="alert">Some AI evidence could not load. Refresh to retry. {loadError.message}</div>}
    {(capped || historyCapped) && <div className="notice warning">This set exceeds the current safe display limit. Rates are paused rather than calculated from partial records.</div>}

    {canEdit && <section className="panel"><div className="panel-heading"><div><h2>Create a prompt set version</h2><p className="muted small">Freeze a set before recording runs. New questions or settings require a new version.</p></div></div>
      <details className="add-detail"><summary>New prompt set</summary><form action={createPromptSet} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Name<input name="name" required maxLength={160} placeholder="Buyer questions" /></label><label>Version<input type="number" name="version" required min={1} defaultValue={1} /></label>
        <label>Language<input name="language" required maxLength={40} defaultValue="en" /></label><label>Region<input name="region" required maxLength={80} placeholder="US" /></label>
        <label>Planned repeats per prompt<input type="number" name="plannedRepeats" required min={1} max={10} defaultValue={3} /></label><div className="form-actions"><button className="button primary">Create set</button></div>
      </form></details></section>}

    <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Prompt sets</h2><p className="muted small">Newest 100 versions.</p></div></div>
      {sets?.length ? <div className="record-list content-list">{sets.map((set) => <Link className={`draft-row${selectedSet?.id === set.id ? " selected" : ""}`} href={`?set=${set.id}`} key={set.id}><strong>{set.name} · v{set.version}</strong><span className="tag">{set.status}</span><span className="muted small">{set.language} · {set.region} · {set.planned_repeats} repeats planned</span></Link>)}</div> : setsError ? <div className="empty compact">Prompt sets unavailable.</div> : <div className="empty compact">No prompt sets yet.</div>}
    </section><section className="panel" id="prompts"><div className="panel-heading"><div><h2>{selectedSet ? `${selectedSet.name} · v${selectedSet.version}` : "Selected set"}</h2><p className="muted small">{selectedSet ? `${selectedSet.language} · ${selectedSet.region} · ${selectedSet.status}` : "Choose or create a set."}</p></div></div>
      {selectedSet && <><div className="record-list">{prompts?.length ? prompts.map((prompt) => <div className="record" key={prompt.id}><strong>{prompt.ordinal}. {prompt.question}</strong><div className="muted small">{prompt.buyer_stage.replaceAll("_"," ")} · {prompt.branded ? "branded" : "unbranded"}</div></div>) : <div className="empty compact">No prompts in this set.</div>}</div>
        {canEdit && selectedSet.status === "draft" && <><details className="add-detail"><summary>Add a prompt</summary><form action={addPrompt} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} />
          <label>Number<input type="number" name="ordinal" min={1} max={100} required defaultValue={(prompts?.length ?? 0)+1} /></label><label>Buyer stage<select name="buyerStage"><option value="discovery">Discovery</option><option value="comparison">Comparison</option><option value="alternatives">Alternatives</option><option value="use_case">Use case</option><option value="reputation">Reputation</option></select></label>
          <label>Names the client?<select name="branded"><option value="no">No, unbranded</option><option value="yes">Yes, branded</option></select></label><label className="wide-field">Exact question<textarea name="question" required maxLength={2000} rows={3} /></label><div className="form-actions"><button className="button secondary">Add prompt</button></div>
        </form></details>{Boolean(prompts?.length) && <form action={freezePromptSet} className="add-detail"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} /><button className="button primary">Freeze this version</button><p className="muted small">After freezing, prompts cannot be added or edited.</p></form>}</>}
      </>}
    </section></div>

    {selectedSet?.status === "frozen" && <><section className="panel"><div className="panel-heading"><div><h2>Exact measurement cohort</h2><p className="muted small">A wave, provider, model, collection method and configuration are never merged silently.</p></div></div>
      {cohorts.length ? <form action={`/clients/${clientId}/ai-visibility`} method="get" className="filter-row"><input type="hidden" name="set" value={selectedSet.id} /><label>Cohort<select name="cohort" defaultValue={selectedCohort}>{cohorts.map((cohort) => { const parts = JSON.parse(cohort) as string[]; return <option value={cohort} key={cohort}>{parts.join(" · ")}</option>; })}</select></label><button className="button secondary">Apply</button></form> : <div className="empty compact">No answer runs imported yet.</div>}
      {selectedCohort && <><div className="summary-strip ai-summary"><div><span className="eyebrow">PLANNED / ATTEMPTED / VALID</span><strong>{summary ? `${summary.planned} / ${summary.attempted} / ${summary.valid}` : "Unavailable"}</strong><span className="small">{summary ? `${summary.errors} errors · ${summary.refusals} refusals` : "Partial data paused"}</span></div><div><span className="eyebrow">MENTION / RECOMMENDATION</span><strong>{summary ? `${rate(summary.mentionRate)} / ${rate(summary.recommendationRate)}` : "Unavailable"}</strong><span className="small">{summary ? `${summary.reviewedValid}/${summary.valid} valid answers reviewed` : "Requires complete review data"}</span></div><div><span className="eyebrow">REDDIT SOURCE RATE</span><strong>{summary ? rate(summary.redditSourceRate) : "Unavailable"}</strong><span className="small">Distinct citing answers / valid answers</span></div></div><p className="coverage-note">These rates describe the saved manual cohort, not consumer-platform exposure or causal lift. A valid answer without human brand review keeps mention and recommendation rates pending. Citation URLs are manually transcribed from visible answer citations.</p></>}
    </section>

    {canEdit && <section className="panel"><div className="panel-heading"><div><h2>Import one observed answer</h2><p className="muted small">One prompt and repeat per record. A failure or refusal remains visible and is excluded from valid-answer rates.</p></div></div><details className="add-detail"><summary>Add manual answer</summary><form action={recordManualAnswer} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} />
      <label>Exact prompt<select name="promptId" required>{prompts?.map((prompt) => <option value={prompt.id} key={prompt.id}>{prompt.ordinal}. {prompt.question}</option>)}</select></label><label>Repeat number<input type="number" name="repeatNo" required min={1} max={selectedSet.planned_repeats} defaultValue={1} /></label>
      <label>Wave label<input name="waveLabel" required maxLength={80} placeholder="2026-09 baseline" /></label><label>Observed at<input name="observedAt" required placeholder="2026-09-27T12:00:00+05:30" /></label>
      <label>Provider as shown<input name="provider" required maxLength={80} placeholder="Provider name" /></label><label>Model/version as shown<input name="modelLabel" required maxLength={120} placeholder="Unknown if not exposed" /></label>
      <label>Collection method<select name="collectionMethod"><option value="manual_consumer">Manual consumer interface</option><option value="manual_api_export">Manual API/export result</option></select></label><label>Outcome<select name="outcome"><option value="valid">Valid answer</option><option value="refusal">Refusal</option><option value="error">Error</option></select></label>
      <label className="wide-field">Configuration and search mode<input name="configNote" required maxLength={500} placeholder="Search on/off, locale, account mode, and other settings" /></label>
      <label className="wide-field">Exact answer text<textarea name="answerText" maxLength={30000} rows={8} /></label><label className="wide-field">Failure/refusal detail<textarea name="errorNote" maxLength={2000} rows={2} /></label>
      <label className="wide-field">Citations visible in the answer, one HTTPS URL per line<textarea name="citationText" rows={3} placeholder="https://www.reddit.com/r/..." /></label>
      <label className="wide-field">Source and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} placeholder="Where the answer came from and permission to retain it" /></label><div className="form-actions"><button className="button primary">Save observed answer</button></div>
    </form></details></section>}

    <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Observed runs</h2><p className="muted small">{cohortRuns.length} in the selected cohort.</p></div></div>
      {cohortRuns.length ? <div className="record-list content-list">{cohortRuns.map((run) => { const prompt = prompts?.find((item) => item.id === run.prompt_id); return <Link className={`draft-row${selectedRun?.id === run.id ? " selected" : ""}`} href={`?set=${selectedSet.id}&cohort=${encodeURIComponent(selectedCohort)}&run=${run.id}`} key={run.id}><strong>{prompt?.ordinal ?? "?"}. {prompt?.question ?? "Prompt unavailable"}</strong><span className="tag">{run.outcome}</span><span className="muted small">Repeat {run.repeat_no} · {new Date(run.observed_at).toLocaleString("en")}</span></Link>; })}</div> : <div className="empty compact">No runs in this cohort.</div>}
    </section><section className="panel"><div className="panel-heading"><div><h2>Answer evidence</h2><p className="muted small">{selectedRun ? `${selectedRun.provider} · ${selectedRun.model_label} · ${selectedRun.collection_method.replaceAll("_"," ")}` : "Select a run."}</p></div></div>
      {selectedRun && <div className="draft-detail"><p><strong>Question:</strong> {selectedPrompt?.question ?? "Prompt unavailable"}</p><p><strong>Outcome:</strong> {selectedRun.outcome} · Repeat {selectedRun.repeat_no} · Observed {new Date(selectedRun.observed_at).toLocaleString("en")}</p><p className="muted small">Configuration: {selectedRun.config_note} · Source: {selectedRun.source_note}</p>
        {selectedRun.answer_text && <p className="draft-body">{selectedRun.answer_text}</p>}{selectedRun.error_note && <p className="muted small">Failure/refusal detail: {selectedRun.error_note}</p>}
        <div className="draft-history"><h3>Visible citations</h3>{selectedCitations.length ? selectedCitations.map((citation) => <p key={citation.id} className="small"><a href={citation.url} target="_blank" rel="noreferrer">{citation.ordinal}. {citation.url} ↗</a></p>) : <p className="muted small">No citations recorded for this answer.</p>}</div>
        <div className="draft-history"><h3>Human brand review</h3>{latestReview ? <p className="small">Version {latestReview.version} · Mention {latestReview.mentions_client ? "yes" : "no"} · Recommendation {latestReview.recommends_client ? "yes" : "no"} · {latestReview.review_note}</p> : <p className="muted small">No human brand review yet.</p>}
          {canReview && selectedRun.outcome === "valid" && complete && <form action={reviewManualAnswer} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="setId" value={selectedSet.id} /><input type="hidden" name="runId" value={selectedRun.id} /><input type="hidden" name="expectedVersion" value={latestReview?.version ?? 0} />
            <label>Names the client?<select name="mention" defaultValue={latestReview?.mentions_client ? "yes" : "no"}><option value="no">No</option><option value="yes">Yes</option></select></label><label>Explicitly recommends the client?<select name="recommendation" defaultValue={latestReview?.recommends_client ? "yes" : "no"}><option value="no">No</option><option value="yes">Yes</option></select></label>
            <label>Review evidence and uncertainty<textarea name="note" required maxLength={2000} rows={3} defaultValue={latestReview?.review_note ?? ""} /></label><button className="button secondary">Save review version</button>
          </form>}{selectedReviews.length > 1 && <details className="review-detail"><summary>Earlier reviews</summary>{selectedReviews.slice(1).map((review) => <p className="small" key={review.id}>v{review.version} · Mention {review.mentions_client ? "yes" : "no"} · Recommendation {review.recommends_client ? "yes" : "no"} · {review.review_note}</p>)}</details>}
        </div>
      </div>}
    </section></div></>}
  </Shell>;
}
