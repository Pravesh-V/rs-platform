import Link from "next/link";
import { DateTime } from "luxon";
import { approveReportSnapshot, createReportSnapshot } from "@/app/actions/reports";
import { Shell } from "@/components/shell";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

type Period = { observations: number; items: number; measured_items: number; latest_lifetime_views: number | null };
type ReportDataset = {
  calculation_version: string; campaign_version: number; timezone: string;
  baseline_dates: [string,string]; comparison_dates: [string,string];
  baseline: Period; comparison: Period;
  matched: { items: number; baseline_views: number | null; comparison_views: number | null; change: number | null };
  evidence_snapshot_ids: string[]; campaign_event_ids: string[]; coverage_note: string;
};
const number = (value: number | null | undefined) => value === null || value === undefined ? "Unknown" : new Intl.NumberFormat("en").format(value);

export default async function ReportsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ report?: string; error?: string }>;
}) {
  const { clientId } = await params;
  const filters = await searchParams;
  const { db, client, role } = await requireClient(clientId);
  const [{ data: reports, count: reportCount, error: reportsError }, { data: campaigns, error: campaignsError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("report_snapshots")
      .select("id,campaign_id,report_month,version,status,calculation_version,dataset,dataset_sha256,executive_summary,next_steps,limitations,created_at,approved_at,approval_note",{count:"exact"})
      .eq("client_id",clientId).order("created_at",{ascending:false}).limit(100)),
    retryIdempotentRequest(async () => db.from("campaigns").select("id,name,baseline_start,baseline_end,comparison_start,comparison_end")
      .eq("client_id",clientId).order("created_at",{ascending:false}).limit(100)),
  ]);
  const capped = reportCount !== null && reportCount > (reports?.length ?? 0);
  const visibleReports = reports ?? [];
  const selected = visibleReports.find((report) => report.id===filters.report) ?? visibleReports[0];
  const dataset = selected?.dataset as ReportDataset | undefined;
  const campaignName = (id: string) => campaigns?.find((campaign) => campaign.id===id)?.name ?? "Campaign";
  const canManage = ["owner","manager"].includes(role);
  const localMonth = DateTime.now().setZone(client.timezone).toFormat("yyyy-LL");

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">CLIENT WORKSPACE · REPORTS</div><h1>Monthly evidence snapshots</h1><p className="muted">Versioned comparisons captured from stored campaign observations.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to overview</Link></div>
    <div className="notice warning"><strong>Internal evidence report, not an attribution claim.</strong><p>Only manually stored, campaign-linked Reddit observations are included. Missing views remain unknown. Analytics, search, competitor and provider AI data are disconnected. An approved version can be downloaded as a branded PDF.</p></div>
    {filters.error && <div className="notice error" role="alert">{filters.error}</div>}
    {(reportsError || campaignsError) && <div className="notice error" role="alert">Reports could not fully load. {reportsError?.message ?? campaignsError?.message}</div>}
    {capped && <div className="notice warning">Showing the newest 100 reports. Older report pagination is still needed.</div>}

    {canManage && <section className="panel"><div className="panel-heading"><div><h2>Freeze a new report version</h2><p className="muted small">The database calculates the two windows and saves the exact evidence IDs and SHA-256 checksum. Later corrections require another version.</p></div></div>
      {campaigns?.length ? <details className="add-detail"><summary>Prepare report snapshot</summary><form action={createReportSnapshot} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Campaign<select name="campaignId" required>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.baseline_start} to {campaign.comparison_end}</option>)}</select></label>
        <label>Report issue month<input name="reportMonth" type="month" required defaultValue={localMonth} /></label>
        <label className="wide-field">Executive summary<textarea name="executiveSummary" required maxLength={5000} rows={4} placeholder="Describe observed changes and their limits; avoid causal claims." /></label>
        <label className="wide-field">Recommended next steps<textarea name="nextSteps" required maxLength={5000} rows={3} placeholder="Actions supported by the saved evidence." /></label>
        <label className="wide-field">Material limitations<textarea name="limitations" required maxLength={5000} rows={3} placeholder="Missing sources, unknown counters, changes in coverage, and other caveats." /></label>
        <div className="form-actions"><button className="button primary">Create draft snapshot</button></div>
      </form></details> : <div className="empty compact">Add a campaign before preparing a report.</div>}
    </section>}

    <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Saved versions</h2><p className="muted small">Newest 100, newest version first for each issue month.</p></div></div>
      {visibleReports.length ? <div className="record-list content-list">{visibleReports.map((report) => <Link key={report.id} className={`draft-row${selected?.id===report.id ? " selected" : ""}`} href={`?report=${report.id}`}><strong>{campaignName(report.campaign_id)} · {report.report_month.slice(0,7)} · v{report.version}</strong><span className="tag">{report.status}</span><span className="muted small">Created {new Date(report.created_at).toLocaleString("en")}</span></Link>)}</div> : reportsError ? <div className="empty compact">Reports unavailable.</div> : <div className="empty compact">No report snapshots yet.</div>}
    </section><section className="panel"><div className="panel-heading"><div><h2>{selected ? `${campaignName(selected.campaign_id)} · ${selected.report_month.slice(0,7)} · v${selected.version}` : "Selected report"}</h2><p className="muted small">{selected ? `${selected.status} · ${selected.calculation_version}` : "Select or create a report."}</p></div>
      {selected && <div className="filter-row"><Link className="button secondary" href={`/clients/${clientId}/reports/${selected.id}/download`}>Evidence JSON</Link>{selected.status === "approved" && <Link className="button primary" href={`/clients/${clientId}/reports/${selected.id}/pdf`}>Download PDF</Link>}</div>}</div>
      {selected && dataset && <div className="draft-detail">
        <p><strong>Executive summary:</strong> {selected.executive_summary}</p>
        <div className="comparison-grid"><div className="metric-card"><span className="eyebrow">BASELINE · {dataset.baseline_dates.join(" – ")}</span><strong>{number(dataset.baseline.latest_lifetime_views)}</strong><span className="muted small">Latest recorded lifetime views · {dataset.baseline.measured_items}/{dataset.baseline.items} measured items · {dataset.baseline.observations} observations</span></div>
          <div className="metric-card"><span className="eyebrow">COMPARISON · {dataset.comparison_dates.join(" – ")}</span><strong>{number(dataset.comparison.latest_lifetime_views)}</strong><span className="muted small">Latest recorded lifetime views · {dataset.comparison.measured_items}/{dataset.comparison.items} measured items · {dataset.comparison.observations} observations</span></div>
          <div className="metric-card accent"><span className="eyebrow">MATCHED ITEMS</span><strong>{dataset.matched.change === null ? "Unknown" : `${dataset.matched.change>=0?"+":""}${number(dataset.matched.change)}`}</strong><span className="muted small">Counter change for {dataset.matched.items} items observed in both periods</span></div></div>
        <p className="coverage-note">{dataset.coverage_note}</p>
        <p><strong>Next steps:</strong> {selected.next_steps}</p><p><strong>Limitations:</strong> {selected.limitations}</p>
        <p className="muted small">Campaign version {dataset.campaign_version} · {dataset.timezone} dates · {dataset.evidence_snapshot_ids.length} evidence observations · {dataset.campaign_event_ids.length} dated interventions</p>
        <p className="muted small">Dataset SHA-256: <code>{selected.dataset_sha256}</code></p>
        {selected.status==="approved" ? <p className="notice">Approved {selected.approved_at ? new Date(selected.approved_at).toLocaleString("en") : ""}. {selected.approval_note}</p>
          : canManage && <details className="review-detail"><summary>Approve this frozen version</summary><p className="muted small">Compare the saved numbers and source IDs with the underlying records. Approval does not publish or share the report.</p><form action={approveReportSnapshot} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="reportId" value={selected.id} /><label>Approval note<textarea name="note" required maxLength={2000} rows={3} placeholder="What you checked and remaining uncertainty" /></label><button className="button primary">Approve internal report</button></form></details>}
      </div>}
    </section></div>
  </Shell>;
}
