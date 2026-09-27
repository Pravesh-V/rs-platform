import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export const dynamic = "force-dynamic";

function label(eventType: string) { return eventType.replaceAll("_"," "); }
function shortId(id: string | null) { return id ? `${id.slice(0,8)}…` : "Unknown"; }

export default async function AgencyAudit({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { db, userId } = await requireUser();
  const filters = await searchParams;
  const { data: memberships, error: membershipError } = await retryIdempotentRequest(async () => db.from("memberships")
    .select("organization_id,role").eq("user_id",userId).eq("role","owner"));
  const ownerOrgIds = memberships?.map((membership) => membership.organization_id) ?? [];
  const selectedOrgId = ownerOrgIds.includes(filters.organization ?? "") ? filters.organization! : ownerOrgIds[0];
  const [{ data: organizations, error: orgError }, { data: clients, error: clientsError }, { data: events, count: eventCount, error: eventsError }] = selectedOrgId ? await Promise.all([
    retryIdempotentRequest(async () => db.from("organizations").select("id,name").in("id",ownerOrgIds).order("name")),
    retryIdempotentRequest(async () => db.from("clients").select("id,name").eq("organization_id",selectedOrgId).order("name").limit(1001)),
    retryIdempotentRequest(async () => db.from("audit_events").select("id,organization_id,client_id,actor_id,event_type,record_id,created_at",{count:"exact"})
      .eq("organization_id",selectedOrgId).order("created_at",{ascending:false}).limit(500)),
  ]) : [{data:[],error:null},{data:[],error:null},{data:[],count:0,error:null}];
  const clientName = (clientId: string | null) => clientId ? clients?.find((client) => client.id===clientId)?.name ?? shortId(clientId) : "Agency";
  const error = membershipError || orgError || clientsError || eventsError;
  return <Shell>
    <div className="page-heading"><div><div className="eyebrow">AGENCY OPERATIONS</div><h1>Audit history</h1><p className="muted">Recorded mutations, approvals and source decisions for an owned organization.</p></div><Link className="button secondary" href="/clients">Back to clients</Link></div>
    {error && <div className="notice error" role="alert">Audit history could not fully load. {error.message}</div>}
    {!membershipError && !ownerOrgIds.length && <div className="notice warning">Only organization owners can inspect the audit history.</div>}
    {selectedOrgId && <section className="panel"><div className="panel-heading"><div><h2>Events</h2><p className="muted small">Newest 500 of the selected organization. Actor IDs identify Auth users; the app does not infer a person&apos;s name from an ID.</p></div></div>
      {organizations && organizations.length>1 && <form action="/agency/audit" method="get" className="filter-row"><label>Organization<select name="organization" defaultValue={selectedOrgId}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><button className="button secondary">Apply</button></form>}
      {eventCount !== null && eventCount > (events?.length ?? 0) && <div className="notice warning">Showing the newest 500 events. Older events need pagination; this is not a complete export.</div>}
      {events?.length ? <div className="table-scroll"><table><thead><tr><th>When</th><th>Event</th><th>Client</th><th>Actor ID</th><th>Record ID</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString("en",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"})} UTC</td><td>{label(event.event_type)}</td><td>{clientName(event.client_id)}</td><td title={event.actor_id ?? ""}>{shortId(event.actor_id)}</td><td title={event.record_id ?? ""}>{shortId(event.record_id)}</td></tr>)}</tbody></table></div>
        : eventsError ? <div className="empty compact">Events unavailable.</div> : <div className="empty compact">No events recorded for this organization.</div>}
    </section>}
    <p className="coverage-note">Audit events show what the application recorded. They do not prove that an external service performed the action. Source records and permissions remain the basis for any client-facing claim.</p>
  </Shell>;
}
