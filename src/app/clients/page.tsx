import Link from "next/link";
import { createClient } from "@/app/actions/records";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { db, userId } = await requireUser();
  const [{ data: clients, error }, { data: organizations, error: organizationsError }, { data: memberships, error: membershipsError },
    { data: access, error: accessError },
    { data: drafts, error: draftsError }, { data: reports, error: reportsError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("clients").select("id,organization_id,name,website,timezone,created_at").order("name")),
    retryIdempotentRequest(async () => db.from("organizations").select("id,name").order("name")),
    retryIdempotentRequest(async () => db.from("memberships").select("organization_id,role").eq("user_id",userId)),
    retryIdempotentRequest(async () => db.from("client_access").select("client_id,role").eq("user_id",userId)),
    retryIdempotentRequest(async () => db.from("content_drafts").select("client_id,status").eq("status","internal_review").limit(1001)),
    retryIdempotentRequest(async () => db.from("report_snapshots").select("client_id,status").eq("status","draft").limit(1001)),
    retryIdempotentRequest(async () => db.from("opportunities").select("client_id,status").eq("status","new").limit(1001)),
  ]);
  const { error: actionError } = await searchParams;
  const ownerOrgs = organizations?.filter((org) => memberships?.some((member) => member.organization_id === org.id && member.role === "owner")) ?? [];
  const workCapped = (drafts?.length ?? 0)>1000 || (reports?.length ?? 0)>1000 || (opportunities?.length ?? 0)>1000;
  const workError = accessError || draftsError || reportsError || opportunitiesError;
  const roleFor = (clientId: string, orgId: string) => memberships?.some((member) => member.organization_id===orgId && member.role==="owner")
    ? "owner" : access?.find((entry) => entry.client_id===clientId)?.role ?? "none";
  const canReviewDraft = (clientId: string) => {
    const client = clients?.find((entry) => entry.id===clientId);
    return client ? ["owner","manager","reviewer"].includes(roleFor(client.id,client.organization_id)) : false;
  };
  const canApproveReport = (clientId: string) => {
    const client = clients?.find((entry) => entry.id===clientId);
    return client ? ["owner","manager"].includes(roleFor(client.id,client.organization_id)) : false;
  };
  const canWorkOpportunity = (clientId: string) => {
    const client = clients?.find((entry) => entry.id===clientId);
    return client ? ["owner","manager","researcher"].includes(roleFor(client.id,client.organization_id)) : false;
  };
  const actionableDrafts = drafts?.filter((row) => canReviewDraft(row.client_id)) ?? [];
  const actionableReports = reports?.filter((row) => canApproveReport(row.client_id)) ?? [];
  const actionableOpportunities = opportunities?.filter((row) => canWorkOpportunity(row.client_id)) ?? [];
  const workCount = (rows: {client_id:string}[] | null, clientId: string) => rows?.filter((row) => row.client_id===clientId).length ?? 0;
  return <Shell><div className="page-heading"><div><div className="eyebrow">AGENCY OVERVIEW</div><h1>Client workspaces</h1><p className="muted">Evidence and activity stay within each client.</p></div><div className="pill">{clients?.length ?? 0} clients</div></div>
    {actionError && <div className="notice error" role="alert">{actionError}</div>}
    {(error || organizationsError || membershipsError) && <div className="notice error" role="alert">Could not load the workspace. Refresh to retry. {error?.message || organizationsError?.message || membershipsError?.message}</div>}
    {workError && <div className="notice error" role="alert">The work queue could not fully load. {workError.message}</div>}
    {workCapped && <div className="notice warning">Work counts exceed the current display limit and are paused until pagination is added.</div>}
    {!workError && !workCapped && <div className="summary-strip"><div><span className="eyebrow">DRAFTS FOR YOUR REVIEW</span><strong>{actionableDrafts.length}</strong><span className="small">Internal review requested</span></div><div><span className="eyebrow">REPORTS FOR YOUR APPROVAL</span><strong>{actionableReports.length}</strong><span className="small">Frozen internal versions</span></div><div><span className="eyebrow">NEW OPPORTUNITIES</span><strong>{actionableOpportunities.length}</strong><span className="small">Manual research queue</span></div></div>}
    <section className="panel"><div className="panel-heading"><h2>Clients</h2><span className="muted small">Only workspaces you may access appear here</span></div>
      {error ? <div className="empty compact">Client list unavailable.</div> : clients?.length ? <div className="client-grid">{clients.map((client) => <Link key={client.id} href={`/clients/${client.id}`} className="client-card"><div className="client-initial">{client.name.charAt(0).toUpperCase()}</div><div><h3>{client.name}</h3><div className="muted small">{client.website ? new URL(client.website).hostname : "Website not recorded"}</div><div className="small">Timezone: {client.timezone}</div>{!workError && !workCapped && <div className="muted small">{workCount(actionableDrafts,client.id)} drafts for review · {workCount(actionableReports,client.id)} reports awaiting approval · {workCount(actionableOpportunities,client.id)} new opportunities</div>}</div><span aria-hidden>↗</span></Link>)}</div> : <div className="empty"><h3>No clients yet</h3><p>Create a client to begin an evidence-backed baseline.</p></div>}
    </section>
    {ownerOrgs.length > 0 && <section className="panel"><div className="panel-heading"><h2>Add a client</h2></div><form action={createClient} className="form-grid">
      <label>Organization<select name="organizationId" required>{ownerOrgs.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select></label>
      <label>Client name<input name="name" maxLength={160} required placeholder="Acme Analytics" /></label>
      <label>Website<input name="website" type="url" placeholder="https://example.com" /></label>
      <label>Timezone<input name="timezone" defaultValue="UTC" required placeholder="America/New_York" /><span className="hint">IANA name, such as Europe/London</span></label>
      <div className="form-actions"><button type="submit" className="button primary">Create client</button></div>
    </form></section>}
    {organizations?.length === 0 && <div className="notice warning"><strong>Organization setup needed.</strong> Create the first organization and owner membership using the private bootstrap steps in the README.</div>}
  </Shell>;
}
