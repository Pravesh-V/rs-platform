import Link from "next/link";
import { ImportPanel } from "@/components/import-panel";
import { Shell } from "@/components/shell";
import { requireClient } from "@/lib/auth";

export default async function Imports({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { db, client, role } = await requireClient(clientId);
  const { data: batches, error } = await db.from("import_batches").select("id,file_name,source_note,row_count,created_at").eq("client_id",clientId).order("created_at",{ ascending:false }).limit(20);
  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">EVIDENCE INTAKE</div><h1>Import Reddit observations</h1><p className="muted">Preview row errors before saving authorized records.</p></div><Link href={`/clients/${clientId}`} className="button secondary">Back to overview</Link></div>
    <div className="notice warning"><strong>Source permissions</strong><p>Import only records you are permitted to store and process. A URL does not grant permission to retrieve or retain its text. ReddSphere does not collect from Reddit automatically.</p></div>
    {error && <div className="notice error">Could not load import history: {error.message}</div>}
    {["owner","manager","researcher"].includes(role) ? <ImportPanel clientId={clientId} /> : <div className="notice error">You do not have import permission for this client.</div>}
    <section className="panel"><div className="panel-heading"><h2>Recent import batches</h2></div>{batches?.length ? <div className="table-scroll"><table><thead><tr><th>Imported</th><th>File</th><th>Rows</th><th>Source note</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{new Date(batch.created_at).toLocaleString()}</td><td>{batch.file_name}</td><td>{batch.row_count}</td><td>{batch.source_note}</td></tr>)}</tbody></table></div> : <div className="empty compact">No imports yet.</div>}</section>
  </Shell>;
}
