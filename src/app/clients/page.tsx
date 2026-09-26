import Link from "next/link";
import { createClient } from "@/app/actions/records";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { db, userId } = await requireUser();
  const [{ data: clients, error }, { data: organizations }, { data: memberships }] = await Promise.all([
    db.from("clients").select("id,name,website,timezone,created_at").order("name"),
    db.from("organizations").select("id,name").order("name"),
    db.from("memberships").select("organization_id,role").eq("user_id",userId),
  ]);
  const { error: actionError } = await searchParams;
  const ownerOrgs = organizations?.filter((org) => memberships?.some((member) => member.organization_id === org.id && member.role === "owner")) ?? [];
  return <Shell><div className="page-heading"><div><div className="eyebrow">AGENCY OVERVIEW</div><h1>Client workspaces</h1><p className="muted">Evidence and activity stay within each client.</p></div><div className="pill">{clients?.length ?? 0} clients</div></div>
    {actionError && <div className="notice error" role="alert">{actionError}</div>}
    {error && <div className="notice error" role="alert">Could not load clients: {error.message}</div>}
    <section className="panel"><div className="panel-heading"><h2>Clients</h2><span className="muted small">Only workspaces you may access appear here</span></div>
      {clients?.length ? <div className="client-grid">{clients.map((client) => <Link key={client.id} href={`/clients/${client.id}`} className="client-card"><div className="client-initial">{client.name.charAt(0).toUpperCase()}</div><div><h3>{client.name}</h3><div className="muted small">{client.website ? new URL(client.website).hostname : "Website not recorded"}</div><div className="small">Timezone: {client.timezone}</div></div><span aria-hidden>↗</span></Link>)}</div> : <div className="empty"><h3>No clients yet</h3><p>Create a client to begin an evidence-backed baseline.</p></div>}
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
