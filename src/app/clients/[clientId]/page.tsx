import Link from "next/link";
import { createCampaign, createFact, recordContribution, reviewFact } from "@/app/actions/records";
import { Shell } from "@/components/shell";
import { requireInternalClient } from "@/lib/auth";
import { evidence, periodBounds } from "@/lib/data";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";
import { contributionGroups, matchedViewChange, summarize } from "@/lib/metrics";

function number(value: number | null) { return value === null ? "Unknown" : new Intl.NumberFormat("en").format(value); }
function timestamp(value: string | null) { return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "Unknown"; }

export default async function ClientOverview({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ campaign?: string; error?: string }> }) {
  const { clientId } = await params;
  const { db, client, role } = await requireInternalClient(clientId);
  const filters = await searchParams;
  const [{ data: facts, error: factsError }, { data: campaigns, error: campaignsError }, { data: contributions, count: contributionCount, error: contributionError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("client_facts").select("id,kind,statement,source_url,review_status,verified_at,review_note,reviewed_at").eq("client_id",clientId).order("created_at",{ ascending:false }).limit(100)),
    retryIdempotentRequest(async () => db.from("campaigns").select("id,name,goal,baseline_start,baseline_end,comparison_start,comparison_end").eq("client_id",clientId).order("created_at",{ ascending:false })),
    retryIdempotentRequest(async () => db.from("contributions").select("id,item_id,format,published_at,campaign_id,verification_status",{count:"exact"}).eq("client_id",clientId).order("published_at",{ ascending:false }).limit(1000)),
  ]);
  let dataset: Awaited<ReturnType<typeof evidence>> | null = null;
  let dataError: string | null = null;
  try { dataset = await evidence(db,clientId); } catch (error) { dataError = error instanceof Error ? error.message : "Could not load evidence."; }
  const campaign = campaigns?.find((item) => item.id === filters.campaign) ?? campaigns?.[0];
  const campaignItems = dataset?.items.filter((item) => !campaign || item.campaign_id === campaign.id) ?? [];
  const itemIds = new Set(campaignItems.map((item) => item.id));
  const snapshots = dataset?.snapshots.filter((item) => itemIds.has(item.item_id)) ?? [];
  const sortedSnapshots = [...snapshots].sort((a,b) => b.observed_at.localeCompare(a.observed_at));
  const itemMap = new Map(campaignItems.map((item) => [item.id,item]));
  const latestSync = dataset?.snapshots.length ? [...dataset.snapshots].sort((a,b) => b.observed_at.localeCompare(a.observed_at))[0].observed_at : null;
  let baseline = null;
  let comparison = null;
  let matched = null;
  let comparisonBounds: [string,string] | null = null;
  let boundsError: string | null = null;
  if (campaign && dataset && !dataset.truncated) {
    try {
      const before = periodBounds(campaign.baseline_start,campaign.baseline_end,client.timezone);
      const after = periodBounds(campaign.comparison_start,campaign.comparison_end,client.timezone);
      comparisonBounds = after;
      baseline = summarize(snapshots,...before);
      comparison = summarize(snapshots,...after);
      matched = matchedViewChange(snapshots,before,after);
    } catch (error) { boundsError = error instanceof Error ? error.message : "Invalid date range."; }
  }
  const contributionCapped = contributionCount === null ? (contributions?.length ?? 0)>=1000 : contributionCount>(contributions?.length ?? 0);
  const campaignContributions = contributions?.filter((entry) => entry.campaign_id===campaign?.id) ?? [];
  const groupedContributions = campaign && dataset && !dataset.truncated && !contributionCapped && comparisonBounds
    ? contributionGroups(campaignContributions,campaignItems,snapshots,comparisonBounds) : null;
  const canEdit = ["owner","manager","researcher"].includes(role);
  const canReview = ["owner","manager"].includes(role);
  const canContribute = canEdit || role === "writer";
  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">CLIENT WORKSPACE</div><h1>{client.name}</h1><p className="muted">Baseline, activity and evidence for this client.</p></div><Link className="button primary" href={`/clients/${clientId}/imports`}>Import evidence</Link></div>
    {filters.error && <div className="notice error" role="alert">{filters.error}</div>}
    {(dataError || factsError || campaignsError || contributionError || boundsError) && <div className="notice error" role="alert">Some records could not load. {dataError || factsError?.message || campaignsError?.message || contributionError?.message || boundsError}</div>}
    {dataset?.truncated && <div className="notice warning">This client has more than 10,000 items or snapshots. Calculations are paused until pagination is expanded; no partial total is shown.</div>}
    {contributionCapped && <div className="notice warning">This client has more than 1,000 recorded contributions. Community and format totals are paused until pagination is expanded.</div>}
    <div className="summary-strip"><div><span className="eyebrow">DATA FRESHNESS</span><strong>{timestamp(latestSync)}</strong></div><div><span className="eyebrow">COVERAGE</span><strong>{dataset?.items.length ?? 0} items · {dataset?.snapshots.length ?? 0} observations</strong></div><div><span className="eyebrow">COLLECTION</span><strong>Manual / authorized imports</strong></div></div>

    <section className="panel" id="campaigns"><div className="panel-heading"><div><h2>Campaign comparison</h2><p className="muted small">Periods use {client.timezone}. Views are latest recorded lifetime counters, never summed snapshots.</p></div><Link className="button secondary" href={`/clients/${clientId}/campaigns`}>Windows &amp; events</Link></div>
      {campaigns?.length ? <><form className="filter-row" action={`/clients/${clientId}`} method="get"><label>Campaign<select name="campaign" defaultValue={campaign?.id}>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button secondary">Apply</button></form>
        {campaign && <div className="comparison-grid"><div className="metric-card"><span className="eyebrow">BASELINE · {campaign.baseline_start} – {campaign.baseline_end}</span><strong>{baseline ? number(baseline.latestViews) : "Unknown"}</strong><span className="muted small">Recorded lifetime views · {baseline?.measuredItems ?? 0} measured items / {baseline?.itemCount ?? 0} observed items</span></div><div className="metric-card"><span className="eyebrow">COMPARISON · {campaign.comparison_start} – {campaign.comparison_end}</span><strong>{comparison ? number(comparison.latestViews) : "Unknown"}</strong><span className="muted small">Recorded lifetime views · {comparison?.measuredItems ?? 0} measured items / {comparison?.itemCount ?? 0} observed items</span></div><div className="metric-card accent"><span className="eyebrow">MATCHED ITEMS</span><strong>{matched ? `${matched.change >= 0 ? "+" : ""}${number(matched.change)}` : "Unknown"}</strong><span className="muted small">Change in recorded lifetime views for {matched?.matchedItems ?? 0} items observed in both periods</span></div></div>}
        <p className="coverage-note">Counters describe observations, not unique people or proof of campaign impact. Missing views stay unknown. The two period totals may include different items; use the matched change for like-for-like items. A post that was not observed in a period cannot be reconstructed retrospectively.</p>
      </> : campaignsError ? <div className="empty compact">Campaigns unavailable.</div> : <div className="empty"><h3>No campaign baseline yet</h3><p>Add two non-overlapping periods to begin a comparison.</p></div>}
      {canEdit && <details className="add-detail"><summary>Add campaign and periods</summary><form action={createCampaign} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><label>Campaign name<input name="name" required maxLength={160} /></label><label>Goal<input name="goal" maxLength={2000} placeholder="Qualified signups" /></label><label>Baseline start<input name="baselineStart" type="date" required /></label><label>Baseline end<input name="baselineEnd" type="date" required /></label><label>Comparison start<input name="comparisonStart" type="date" required /></label><label>Comparison end<input name="comparisonEnd" type="date" required /></label><div className="form-actions"><button className="button primary">Save campaign</button></div></form></details>}
    </section>

    <div className="two-column"><section className="panel" id="facts"><div className="panel-heading"><h2>Company knowledge</h2><span className="muted small">{facts?.length ?? 0} facts</span></div>
      {facts?.length ? <div className="record-list">{facts.map((fact) => <div key={fact.id} className="record">
        <span className="tag">{fact.kind.replaceAll("_"," ")}</span>
        <p>{fact.statement}</p>
        <div className="muted small">{fact.review_status} · Submitted verification date {fact.verified_at ?? "not supplied"}{fact.source_url && <> · <a href={fact.source_url} target="_blank" rel="noreferrer">Source ↗</a></>}</div>
        {fact.reviewed_at && <div className="muted small">Reviewed {timestamp(fact.reviewed_at)}{fact.review_note && <> · {fact.review_note}</>}</div>}
        {canReview && <details className="review-detail"><summary>Review fact</summary><form action={reviewFact} className="stack">
          <input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="factId" value={fact.id} />
          <label>Decision<select name="status" defaultValue={fact.review_status === "pending" ? "approved" : fact.review_status}><option value="approved">Approve</option><option value="rejected">Reject</option><option value="stale">Mark stale</option></select></label>
          <label>Review note<textarea name="note" maxLength={1000} rows={2} defaultValue={fact.review_note ?? ""} placeholder="Reason or source check" /></label>
          <button className="button secondary">Save review</button>
        </form></details>}
      </div>)}</div> : factsError ? <div className="empty compact">Company facts unavailable.</div> : <div className="empty compact">No company facts recorded.</div>}
      {canEdit && <details className="add-detail"><summary>Add company fact</summary><form action={createFact} className="stack"><input type="hidden" name="clientId" value={clientId} /><label>Type<select name="kind">{["product","alias","positioning","customer","differentiator","pricing","prohibited_claim","tone","objective","other"].map((kind) => <option value={kind} key={kind}>{kind.replaceAll("_"," ")}</option>)}</select></label><label>Statement<textarea name="statement" required maxLength={5000} rows={3} /></label><label>Source URL<input name="sourceUrl" type="url" placeholder="https://..." /></label><label>Verified on<input name="verifiedAt" type="date" /></label><button className="button primary">Save fact for review</button></form></details>}
    </section><section className="panel" id="contributions"><div className="panel-heading"><h2>Recorded contributions</h2><span className="muted small">User-reported publication URLs</span></div>
      {contributions?.length ? <div className="record-list">{contributions.slice(0,50).map((contribution) => { const item=dataset?.items.find((entry) => entry.id===contribution.item_id); return <div key={contribution.id} className="record"><div><span className="tag">{contribution.format}</span> <strong>{item ? `r/${item.subreddit}` : "Reddit item"}</strong></div><div className="muted small">Reported published {timestamp(contribution.published_at)} · {contribution.verification_status.replaceAll("_"," ")}{item && <> · <a href={item.canonical_url} target="_blank" rel="noreferrer">Open on Reddit ↗</a></>}</div></div>; })}</div> : contributionError ? <div className="empty compact">Contributions unavailable.</div> : <div className="empty compact">No publications recorded. Approval alone never creates a contribution.</div>}
      {canContribute && <details className="add-detail"><summary>Record a published post or comment</summary><form action={recordContribution} className="stack"><input type="hidden" name="clientId" value={clientId} /><label>Actual Reddit URL<input name="url" type="url" required placeholder="https://www.reddit.com/r/.../comments/..." /></label><label>Title or description<input name="title" maxLength={500} /></label><label>Campaign<select name="campaignId"><option value="">No campaign</option>{campaigns?.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Format<select name="format"><option value="post">Post</option><option value="comment">Comment</option><option value="faq">FAQ</option><option value="tutorial">Tutorial</option><option value="comparison">Comparison</option><option value="other">Other</option></select></label><label>Publication time<input name="publishedAt" required placeholder="2026-09-26T10:30:00+05:30" /><span className="hint">Include the timezone offset.</span></label><button className="button primary">Record publication</button></form></details>}
    </section></div>

    {campaign && <section className="panel"><div className="panel-heading"><div><h2>Community &amp; format observations</h2><p className="muted small">Recorded contributions linked to {campaign.name}; latest known lifetime views observed in its comparison window.</p></div></div>
      {groupedContributions?.length ? <div className="table-scroll"><table><thead><tr><th>Community</th><th>Format</th><th>Contributions</th><th>Observed items</th><th>Known views</th><th>Latest lifetime views</th></tr></thead><tbody>{groupedContributions.map((group) => <tr key={`${group.subreddit}:${group.format}`}><td>r/{group.subreddit}</td><td>{group.format}</td><td>{group.contributions}</td><td>{group.observedItems}/{group.contributions}</td><td>{group.measuredItems}/{group.contributions}</td><td>{number(group.latestLifetimeViews)}</td></tr>)}</tbody></table></div>
        : contributionCapped || dataset?.truncated || dataError || boundsError || contributionError ? <div className="empty compact">Group totals are unavailable until the evidence is complete.</div>
          : <div className="empty compact">No recorded contributions are linked to this campaign.</div>}
      <p className="coverage-note">These are recorded contributions and observed counters, not unique reach or conversion attribution. An unobserved item is not treated as zero views. Community and format groups may differ in age, audience and source coverage, so their values do not establish which approach caused an outcome.</p>
    </section>}

    <section className="panel" id="evidence"><div className="panel-heading"><div><h2>Evidence observations</h2><p className="muted small">{campaign ? `Campaign: ${campaign.name}` : "All client items"} · {snapshots.length} observations · showing the newest 100</p></div><Link className="button secondary" href={`/clients/${clientId}/export${campaign ? `?campaign=${campaign.id}` : ""}`}>Export CSV</Link></div>
      {sortedSnapshots.length ? <div className="table-scroll"><table><thead><tr><th>Observed</th><th>Reddit item</th><th>Affiliation</th><th>Views, lifetime</th><th>Score</th><th>Replies</th><th>Source</th></tr></thead><tbody>{sortedSnapshots.slice(0,100).map((observation) => { const item=itemMap.get(observation.item_id); return <tr key={observation.id}><td>{timestamp(observation.observed_at)}</td><td>{item ? <a href={item.canonical_url} target="_blank" rel="noreferrer">r/{item.subreddit} · {item.external_id} ↗</a> : "Unknown item"}</td><td>{item?.affiliation ?? "Unknown"}</td><td>{number(observation.views)}</td><td>{number(observation.score)}</td><td>{number(observation.replies)}</td><td>{observation.source_type.replaceAll("_"," ")}</td></tr>; })}</tbody></table></div> : dataError ? <div className="empty compact">Evidence unavailable.</div> : <div className="empty"><h3>No evidence observations</h3><p>Import authorized records to populate comparisons. Unknown values will remain unknown.</p><Link href={`/clients/${clientId}/imports`} className="button secondary">Go to imports</Link></div>}
    </section>
  </Shell>;
}
