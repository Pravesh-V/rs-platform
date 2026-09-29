import Link from "next/link";
import { recordAnalyticsObservation } from "@/app/actions/analytics";
import { Shell } from "@/components/shell";
import { requireInternalClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export default async function AnalyticsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ observation?: string; error?: string }>;
}) {
  const { clientId } = await params;
  const filters = await searchParams;
  const { db, client, role } = await requireInternalClient(clientId);
  const [{ data: observations, count, error }, { data: campaigns, error: campaignsError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("analytics_observations")
      .select("id,campaign_id,supersedes_id,source_kind,property_reference,property_timezone,period_start,period_end,dimension_scope,source_name,medium,campaign_tag,content_tag,metric_name,event_name,metric_value,currency,attribution_note,source_note,created_at",{count:"exact"})
      .eq("client_id",clientId).order("created_at",{ascending:false}).limit(100)),
    retryIdempotentRequest(async () => db.from("campaigns").select("id,name").eq("client_id",clientId).order("name").limit(100)),
  ]);
  const selected = observations?.find((row) => row.id===filters.observation) ?? observations?.[0];
  const superseded = new Set(observations?.map((row) => row.supersedes_id).filter((id): id is string => Boolean(id)) ?? []);
  const canRecord = ["owner","manager"].includes(role);
  const capped = count !== null && count > (observations?.length ?? 0);
  const campaignName = (id: string | null) => id ? campaigns?.find((row) => row.id===id)?.name ?? "Unavailable campaign" : "No campaign link";

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">TRAFFIC &amp; CONVERSION EVIDENCE</div><h1>Analytics observations</h1><p className="muted">Permissioned, manually entered metrics for {client.name}.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to overview</Link></div>
    <div className="notice warning"><strong>No GA4 property is connected.</strong><p>Enter one metric from an authorized report or client-supplied source. Session traffic dimensions and event-attributed key events use different scopes and must not be blended. A tagged visit or key event does not prove Reddit caused it; untagged or stripped links remain unattributed.</p></div>
    {filters.error && <div className="notice error" role="alert">{filters.error}</div>}
    {(error || campaignsError) && <div className="notice error" role="alert">Analytics evidence could not fully load. {error?.message ?? campaignsError?.message}</div>}
    {capped && <div className="notice warning">Showing the newest 100 records. Older records need pagination; no totals are calculated from this partial list.</div>}

    {canRecord && <section className="panel"><div className="panel-heading"><div><h2>Record a sourced metric</h2><p className="muted small">Each entry is immutable. For a correction, create another row and link the earlier entry.</p></div></div>
      <details className="add-detail"><summary>New analytics observation</summary><form action={recordAnalyticsObservation} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Source type<select name="sourceKind"><option value="ga4_export">Authorized GA4 export</option><option value="other_authorized_export">Other authorized export</option><option value="manual_client_report">Client-supplied manual report</option></select></label>
        <label>Property or report reference<input name="propertyReference" required maxLength={160} placeholder="GA4 property ID or client report name" /></label>
        <label>Reporting time zone<input name="propertyTimezone" required maxLength={80} defaultValue={client.timezone} placeholder="Asia/Kolkata" /></label>
        <label>Campaign<select name="campaignId" defaultValue=""><option value="">No confirmed campaign link</option>{campaigns?.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label>Start date<input name="periodStart" type="date" required /></label><label>End date<input name="periodEnd" type="date" required /></label>
        <label>Traffic dimension scope<select name="dimensionScope"><option value="session">Session source / medium</option><option value="event">Event-attributed source / medium</option></select></label>
        <label>Metric<select name="metricName"><option value="sessions">Sessions</option><option value="key_events">Key events</option><option value="revenue">Revenue</option></select></label>
        <label>Reported source<input name="sourceName" required maxLength={160} placeholder="reddit or (not set)" /></label><label>Reported medium<input name="medium" required maxLength={160} placeholder="organic_social or referral" /></label>
        <label>Reported campaign tag<input name="campaignTag" maxLength={160} placeholder="UTM campaign value, if present" /></label><label>Reported content tag<input name="contentTag" maxLength={160} placeholder="UTM content value, if present" /></label>
        <label>Metric value<input name="metricValue" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="0" /></label><label>Key event name<input name="eventName" maxLength={160} placeholder="Required for key events only" /></label>
        <label>Revenue currency<input name="currency" maxLength={3} placeholder="ISO code for revenue only, e.g. USD" /></label>
        <label className="wide-field">Attribution model or metric-definition note<textarea name="attributionNote" required maxLength={1000} rows={2} placeholder="State the report scope, model and filters; for session metrics say how source/medium was assigned." /></label>
        <label className="wide-field">Source and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} placeholder="Who supplied the data, export/report date and right to use it" /></label>
        <label className="wide-field">Correct earlier record<select name="supersedesId" defaultValue=""><option value="">No correction</option>{observations?.map((row) => <option key={row.id} value={row.id}>{row.period_start} to {row.period_end} · {row.metric_name} · {row.id.slice(0,8)}</option>)}</select></label>
        <div className="form-actions"><button className="button primary">Save observation</button></div>
      </form></details>
    </section>}

    <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Recorded evidence</h2><p className="muted small">Newest 100. Values are not summed across properties, scopes, attribution models or overlapping dates.</p></div><span className="pill">{count ?? observations?.length ?? 0} records</span></div>
      {observations?.length ? <div className="record-list content-list">{observations.map((row) => <Link key={row.id} href={`?observation=${row.id}`} className={`draft-row${selected?.id===row.id ? " selected" : ""}`}><strong>{row.metric_name.replaceAll("_"," ")} · {row.metric_value}{row.currency ? ` ${row.currency}` : ""}</strong><span className="tag">{superseded.has(row.id) ? "superseded" : row.dimension_scope}</span><span className="muted small">{row.period_start} to {row.period_end} · {row.source_name} / {row.medium}</span></Link>)}</div> : error ? <div className="empty compact">Records unavailable.</div> : <div className="empty compact">No analytics evidence recorded.</div>}
    </section><section className="panel"><div className="panel-heading"><h2>Source detail</h2></div>
      {selected ? <div className="draft-detail"><p><strong>Metric:</strong> {selected.metric_name.replaceAll("_"," ")} = {selected.metric_value}{selected.currency ? ` ${selected.currency}` : ""}{selected.event_name ? ` · ${selected.event_name}` : ""}</p>
        <p><strong>Period:</strong> {selected.period_start} to {selected.period_end} · {selected.property_timezone}</p>
        <p><strong>Property:</strong> {selected.property_reference} · {selected.source_kind.replaceAll("_"," ")}</p>
        <p><strong>Dimensions:</strong> {selected.dimension_scope} · {selected.source_name} / {selected.medium}</p>
        <p><strong>Campaign:</strong> {campaignName(selected.campaign_id)}{selected.campaign_tag ? ` · UTM campaign ${selected.campaign_tag}` : ""}{selected.content_tag ? ` · UTM content ${selected.content_tag}` : ""}</p>
        <p><strong>Attribution/definition:</strong> {selected.attribution_note}</p><p><strong>Source and permission:</strong> {selected.source_note}</p>
        {selected.supersedes_id && <p className="muted small">Corrects record {selected.supersedes_id}.</p>}
        {superseded.has(selected.id) && <p className="notice warning">A newer record corrects this entry. Do not use this value in a current comparison.</p>}
        <p className="muted small">Recorded {new Date(selected.created_at).toLocaleString("en")}. This is source-reported data; no Google API request was made.</p>
      </div> : <div className="empty compact">Select an observation.</div>}
    </section></div>
  </Shell>;
}
