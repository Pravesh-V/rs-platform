import Link from "next/link";
import { addCommunity, addOpportunity, setOpportunityStatus } from "@/app/actions/research";
import { Shell } from "@/components/shell";
import { requireInternalClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

const statuses = ["new","reviewed","assigned","drafted","dismissed"];

export default async function Research({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { clientId } = await params;
  const { error: actionError } = await searchParams;
  const { db, client, role } = await requireInternalClient(clientId);
  const [{ data: communities, error: communitiesError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("community_research").select("id,subreddit,relevance_note,activity_note,rules_url,rules_summary,rules_checked_at,promotion_policy,source_note,created_at").eq("client_id",clientId).order("created_at",{ ascending:false }).limit(100)),
    retryIdempotentRequest(async () => db.from("opportunities").select("id,external_id,canonical_url,subreddit,title,context_note,suggested_angle,priority,priority_reason,status,source_note,observed_at").eq("client_id",clientId).order("created_at",{ ascending:false }).limit(100)),
  ]);
  const canEdit = ["owner","manager","researcher"].includes(role);
  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">MANUAL RESEARCH</div><h1>Communities &amp; opportunities</h1><p className="muted">Record sourced observations and next actions for {client.name}.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to overview</Link></div>
    <div className="notice warning"><strong>Manual evidence only.</strong><p>No Reddit search or rules are fetched here. Check community rules at their source, record when you checked them, and use only content you are permitted to store.</p></div>
    {actionError && <div className="notice error" role="alert">{actionError}</div>}
    {(communitiesError || opportunitiesError) && <div className="notice error" role="alert">Some research could not load. Refresh to retry. {communitiesError?.message || opportunitiesError?.message}</div>}

    <section className="panel" id="communities"><div className="panel-heading"><div><h2>Subreddit directory</h2><p className="muted small">Rules and activity notes are dated manual observations, not guarantees of approval or reach.</p></div><span className="pill">{communities?.length ?? 0} recorded</span></div>
      {communities?.length ? <div className="record-list">{communities.map((entry) => <div className="record" key={entry.id}>
        <strong>r/{entry.subreddit}</strong> <span className="tag">{entry.promotion_policy.replaceAll("_"," ")}</span>
        <p>{entry.relevance_note}</p>
        {entry.activity_note && <p className="muted small">Activity: {entry.activity_note}</p>}
        {entry.rules_summary && <p className="muted small">Rules: {entry.rules_summary}</p>}
        <div className="muted small">Rules checked {entry.rules_checked_at ?? "not recorded"} · Source: {entry.source_note}{entry.rules_url && <> · <a href={entry.rules_url} target="_blank" rel="noreferrer">Open rules ↗</a></>}</div>
      </div>)}</div> : communitiesError ? <div className="empty compact">Community records unavailable.</div> : <div className="empty compact">No communities recorded for this client.</div>}
      {canEdit && <details className="add-detail"><summary>Add a community</summary><form action={addCommunity} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Subreddit<input name="subreddit" required maxLength={82} placeholder="r/example" /></label>
        <label>Promotion policy<select name="promotionPolicy" defaultValue="unknown"><option value="unknown">Unknown</option><option value="allowed">Allowed</option><option value="restricted">Restricted</option><option value="not_allowed">Not allowed</option></select></label>
        <label>Why it is relevant<textarea name="relevanceNote" required maxLength={2000} rows={2} /></label>
        <label>Observed activity<textarea name="activityNote" maxLength={2000} rows={2} placeholder="Note posts, replies, and observation period; do not infer reach." /></label>
        <label>Rules URL<input name="rulesUrl" type="url" placeholder="https://www.reddit.com/r/example/about/rules" /></label>
        <label>Rules checked on<input name="rulesCheckedAt" type="date" /></label>
        <label>Rules summary<textarea name="rulesSummary" maxLength={5000} rows={2} /></label>
        <label>Source and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} placeholder="Manual review of public rules on this date" /></label>
        <div className="form-actions"><button className="button primary">Save community</button></div>
      </form></details>}
    </section>

    <section className="panel" id="opportunities"><div className="panel-heading"><div><h2>Opportunity queue</h2><p className="muted small">Priorities are human judgments with stated reasons, not predicted sales.</p></div><span className="pill">{opportunities?.length ?? 0} recorded</span></div>
      {opportunities?.length ? <div className="record-list">{opportunities.map((entry) => <div className="record" key={entry.id}>
        <div><span className="tag">{entry.priority} priority</span> <span className="tag">{entry.status}</span> <strong>r/{entry.subreddit}</strong></div>
        <p><a href={entry.canonical_url} target="_blank" rel="noreferrer">{entry.title} ↗</a></p>
        <p className="muted small">Context: {entry.context_note}</p>
        {entry.suggested_angle && <p className="muted small">Possible helpful angle: {entry.suggested_angle}</p>}
        <div className="muted small">Why this priority: {entry.priority_reason} · Observed {new Date(entry.observed_at).toLocaleString("en", { timeZone:"UTC" })} UTC · Source: {entry.source_note}</div>
        {canEdit && <form action={setOpportunityStatus} className="opportunity-status"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="opportunityId" value={entry.id} /><label>Status<select name="status" defaultValue={entry.status}>{statuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></label><button className="button secondary">Update status</button></form>}
      </div>)}</div> : opportunitiesError ? <div className="empty compact">Opportunities unavailable.</div> : <div className="empty compact">No opportunities recorded for this client.</div>}
      {canEdit && <details className="add-detail"><summary>Add an opportunity</summary><form action={addOpportunity} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Reddit post or comment URL<input name="url" type="url" required placeholder="https://www.reddit.com/r/.../comments/..." /></label>
        <label>Observed at<input name="observedAt" placeholder="2026-09-27T12:00:00+05:30" /><span className="hint">Timezone required; blank uses the time of entry.</span></label>
        <label>Thread or comment title<input name="title" required maxLength={500} /></label>
        <label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label>Conversation context<textarea name="contextNote" required maxLength={5000} rows={3} /></label>
        <label>Possible helpful angle<textarea name="suggestedAngle" maxLength={5000} rows={3} /></label>
        <label>Why this priority<textarea name="priorityReason" required maxLength={2000} rows={2} placeholder="Buyer question, fit, freshness, and feasibility" /></label>
        <label>Source and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} /></label>
        <div className="form-actions"><button className="button primary">Save opportunity</button></div>
      </form></details>}
    </section>
  </Shell>;
}
