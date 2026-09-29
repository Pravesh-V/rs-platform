import Link from "next/link";
import { z } from "zod";
import { addCampaignEvent, reviseCampaign } from "@/app/actions/campaigns";
import { Shell } from "@/components/shell";
import { UtmBuilder } from "@/components/utm-builder";
import { requireInternalClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export default async function CampaignPlanning({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ error?: string; campaign?: string }>;
}) {
  const { clientId } = await params;
  const { error: actionError, campaign: requestedCampaign } = await searchParams;
  const { db, client, role } = await requireInternalClient(clientId);
  const { data: campaigns, error: campaignsError } = await retryIdempotentRequest(async () =>
    db.from("campaigns").select("id,name,goal,baseline_start,baseline_end,comparison_start,comparison_end,current_version").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100));
  const selected = campaigns?.find((item) => item.id === requestedCampaign) ?? campaigns?.[0];
  const [{ data: versions, error: versionsError }, { data: events, error: eventsError }, { data: contributionOptions, error: contributionsError }] = selected ? await Promise.all([
    retryIdempotentRequest(async () => db.from("campaign_versions").select("id,version,name,goal,baseline_start,baseline_end,comparison_start,comparison_end,change_reason,origin,recorded_at").eq("client_id", clientId).eq("campaign_id", selected.id).order("version", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("campaign_events").select("id,event_type,occurred_at,description,source_note,recorded_at").eq("client_id", clientId).eq("campaign_id", selected.id).order("occurred_at", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("contributions").select("id,format,published_at").eq("client_id",clientId).eq("campaign_id",selected.id).order("published_at",{ascending:false}).limit(101)),
  ]) : [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }];
  const canEdit = ["owner", "manager", "researcher"].includes(role);
  const invalidSelection = requestedCampaign && z.uuid().safeParse(requestedCampaign).success && !campaigns?.some((item) => item.id === requestedCampaign);

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">CAMPAIGN HISTORY</div><h1>Windows &amp; interventions</h1><p className="muted">Keep analysis periods and other changes explainable for {client.name}.</p></div><Link href={`/clients/${clientId}`} className="button secondary">Back to comparison</Link></div>
    <div className="notice warning"><strong>Observational evidence.</strong><p>Changing a window recalculates the live comparison. Earlier window definitions remain in history; launch, pricing, advertising and site changes are context, not proof that they caused a metric shift. Legacy campaigns start with a snapshot taken when this feature was installed.</p></div>
    {actionError && <div className="notice error" role="alert">{actionError}</div>}
    {(campaignsError || versionsError || eventsError || contributionsError) && <div className="notice error" role="alert">Some campaign history could not load. Refresh to retry. {campaignsError?.message || versionsError?.message || eventsError?.message || contributionsError?.message}</div>}
    {invalidSelection && <div className="notice warning">That campaign is unavailable to this client; showing the most recent accessible campaign.</div>}
    <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Campaigns</h2><p className="muted small">Showing the newest 100.</p></div></div>
      {campaigns?.length ? <div className="record-list content-list">{campaigns.map((campaign) => <Link className={`draft-row${selected?.id === campaign.id ? " selected" : ""}`} href={`?campaign=${campaign.id}`} key={campaign.id}><strong>{campaign.name}</strong><span className="muted small">Version {campaign.current_version} · {campaign.baseline_start} to {campaign.comparison_end}</span></Link>)}</div> : campaignsError ? <div className="empty compact">Campaigns unavailable.</div> : <div className="empty compact">No campaigns yet. Create one on the client overview.</div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>{selected?.name ?? "Select a campaign"}</h2><p className="muted small">{selected ? `Current definition · version ${selected.current_version}` : "Campaign details will appear here."}</p></div></div>
      {selected && <div className="draft-detail"><p><strong>Goal:</strong> {selected.goal || "Not specified"}</p><p><strong>Baseline:</strong> {selected.baseline_start} – {selected.baseline_end}</p><p><strong>Comparison:</strong> {selected.comparison_start} – {selected.comparison_end}</p><p className="muted small">Dates use the client timezone, {client.timezone}.</p>
        {canEdit && <details className="review-detail"><summary>Build a tagged Reddit landing link</summary>{(contributionOptions?.length ?? 0)>100 && <p className="muted small">Only the newest 100 contributions are available in the selector.</p>}<UtmBuilder campaignId={selected.id} defaultDestination={client.website ?? ""} contributions={contributionOptions?.slice(0,100) ?? []} /></details>}
        {canEdit && <details className="review-detail"><summary>Revise campaign windows or goal</summary><form action={reviseCampaign} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="campaignId" value={selected.id} /><input type="hidden" name="expectedVersion" value={selected.current_version} />
          <label>Name<input name="name" required maxLength={160} defaultValue={selected.name} /></label><label>Goal<input name="goal" maxLength={2000} defaultValue={selected.goal ?? ""} /></label>
          <label>Baseline start<input type="date" name="baselineStart" required defaultValue={selected.baseline_start} /></label><label>Baseline end<input type="date" name="baselineEnd" required defaultValue={selected.baseline_end} /></label>
          <label>Comparison start<input type="date" name="comparisonStart" required defaultValue={selected.comparison_start} /></label><label>Comparison end<input type="date" name="comparisonEnd" required defaultValue={selected.comparison_end} /></label>
          <label className="wide-field">Reason for change<textarea name="reason" required maxLength={1000} rows={2} placeholder="Explain why the analysis definition changed" /></label><div className="form-actions"><button className="button primary">Save new version</button></div>
        </form></details>}
        <div className="draft-history"><h3>Window history</h3>{versions?.map((version) => <div className="campaign-version" key={version.id}><strong>Version {version.version}</strong> <span className="tag">{version.origin.replaceAll("_", " ")}</span><p className="small">{version.name} · Baseline {version.baseline_start} – {version.baseline_end} · Comparison {version.comparison_start} – {version.comparison_end}</p>{version.change_reason && <p className="muted small">Reason: {version.change_reason}</p>}<p className="muted small">Recorded {new Date(version.recorded_at).toLocaleString("en")}</p></div>)}{versions?.length === 100 && <p className="muted small">Only the latest 100 versions are shown.</p>}</div>
        <div className="draft-history" id="events"><h3>Intervention timeline</h3>{events?.length ? events.map((event) => <div className="campaign-version" key={event.id}><span className="tag">{event.event_type.replaceAll("_", " ")}</span><strong> {new Date(event.occurred_at).toLocaleString("en")}</strong><p>{event.description}</p><p className="muted small">Source: {event.source_note} · Recorded {new Date(event.recorded_at).toLocaleString("en")}</p></div>) : <p className="muted small">No interventions recorded.</p>}{events?.length === 100 && <p className="muted small">Only the latest 100 events are shown.</p>}
          {canEdit && <details className="review-detail"><summary>Record an intervention</summary><form action={addCampaignEvent} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="campaignId" value={selected.id} />
            <label>Type<select name="eventType"><option value="launch">Launch</option><option value="pricing_change">Pricing change</option><option value="advertising_change">Advertising change</option><option value="site_change">Site change</option><option value="other">Other</option></select></label>
            <label>Occurred at<input name="occurredAt" required placeholder="2026-09-27T12:00:00+05:30" /><span className="hint">Use the actual timestamp with timezone offset.</span></label>
            <label>Description<textarea name="description" required maxLength={2000} rows={2} /></label><label>Source note<textarea name="sourceNote" required maxLength={2000} rows={2} placeholder="Who recorded this, or where it was documented" /></label>
            <button className="button secondary">Record event</button>
          </form></details>}
        </div>
      </div>}
    </section></div>
  </Shell>;
}
