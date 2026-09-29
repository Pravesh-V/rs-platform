import Link from "next/link";
import { ImportPanel } from "@/components/import-panel";
import { Shell } from "@/components/shell";
import { requireInternalClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export default async function Imports({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { db, client, role } = await requireInternalClient(clientId);
  const [{ data: batches, error }, { data: campaigns, error: campaignsError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("import_batches").select("id,file_name,source_note,row_count,created_at").eq("client_id",clientId).order("created_at",{ ascending:false }).limit(20)),
    retryIdempotentRequest(async () => db.from("campaigns").select("id,name").eq("client_id",clientId).order("created_at",{ ascending:false })),
  ]);
  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">EVIDENCE INTAKE</div><h1>Import Reddit observations</h1><p className="muted">Preview row errors before saving authorized records.</p></div><Link href={`/clients/${clientId}`} className="button secondary">Back to overview</Link></div>
    <div className="notice warning"><strong>Source permissions</strong><p>Import only records you are permitted to store and process. A URL does not grant permission to retrieve or retain its text. ReddSphere does not collect from Reddit automatically.</p></div>
    {error && <div className="notice error">Could not load import history: {error.message}</div>}
    {campaignsError && <div className="notice error">Could not load campaigns: {campaignsError.message}</div>}
    {["owner","manager","researcher"].includes(role) && !campaignsError ? <ImportPanel clientId={clientId} campaigns={campaigns ?? []} /> : !["owner","manager","researcher"].includes(role) ? <div className="notice error">You do not have import permission for this client.</div> : null}
    <section className="panel"><div className="panel-heading"><h2>Recent import batches</h2></div>{batches?.length ? <div className="table-scroll"><table><thead><tr><th>Imported</th><th>File</th><th>Rows</th><th>Source note</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{new Date(batch.created_at).toLocaleString()}</td><td>{batch.file_name}</td><td>{batch.row_count}</td><td>{batch.source_note}</td></tr>)}</tbody></table></div> : error ? <div className="empty compact">Import history unavailable.</div> : <div className="empty compact">No imports yet.</div>}</section>
  </Shell>;
}
