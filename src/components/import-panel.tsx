"use client";

import { useState, useTransition } from "react";
import { commitImport } from "@/app/actions/imports";
import { previewCsv, type Preview } from "@/lib/imports";

export function ImportPanel({ clientId, campaigns }: { clientId: string; campaigns: { id: string; name: string }[] }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();

  async function chooseFile(file?: File) {
    setPreview(null); setMessage(""); setBatchId("");
    if (!file) return;
    setFileName(file.name); setKey(crypto.randomUUID());
    try {
      if (file.size > 1_000_000) throw new Error("Use a CSV smaller than 1 MB.");
      const content = await file.text();
      setCsv(content);
      setPreview(previewCsv(content, campaignId));
    } catch (error) { setMessageIsError(true); setMessage(error instanceof Error ? error.message : "Could not read the file."); }
  }

  function chooseCampaign(value: string) {
    setCampaignId(value); setMessage(""); setPreview(null);
    if (!csv) return;
    try { setPreview(previewCsv(csv, value)); }
    catch (error) { setMessageIsError(true); setMessage(error instanceof Error ? error.message : "Could not preview the file."); }
  }

  function save() {
    if (!preview?.rows.length || preview.errors.length || !sourceNote.trim() || !key) return;
    setMessage(""); setBatchId("");
    startTransition(async () => {
      const result = await commitImport(clientId,csv,fileName,sourceNote,key,campaignId);
      if (result.ok) { setBatchId(result.batchId); setMessageIsError(false); setMessage(`${result.count} rows committed. Repeating this submission will reuse the same batch.`); }
      else { setMessageIsError(true); setMessage(result.message); }
    });
  }

  return <section className="panel"><div className="panel-heading"><div><h2>New CSV import</h2><p className="muted small">Up to 500 rows or 1 MB per batch. Timestamps require a timezone offset.</p></div><a className="button secondary" href="/templates/reddit-items.csv" download>Download template</a></div>
    <div className="stack"><label>CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0])} /></label><label>Assign rows to campaign<select value={campaignId} onChange={(event) => chooseCampaign(event.target.value)} disabled={Boolean(batchId)}><option value="">Use CSV campaign IDs or leave unassigned</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><span className="hint">The selection fills blank campaign IDs. Rows naming a different campaign are rejected.</span></label><label>Where this evidence came from<textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} rows={2} maxLength={1000} placeholder="Owner-provided account insights export, used with permission" /><span className="hint">Record permission and collection context for later audit.</span></label></div>
    {preview && <div className="preview"><div className="preview-counts"><span className="pill success">{preview.rows.length} valid</span><span className={`pill ${preview.errors.length ? "danger" : ""}`}>{preview.errors.length} errors</span></div>
      {preview.errors.length ? <div className="notice error"><strong>Fix these rows before saving</strong><ul>{preview.errors.slice(0,30).map((issue) => <li key={issue.line}>Row {issue.line}: {issue.message}</li>)}</ul>{preview.errors.length > 30 && <p>And {preview.errors.length-30} more errors.</p>}</div> : <p className="muted small">Preview passed. Repeated item/timestamp records are deduplicated during commit.</p>}
      {preview.rows.length > 0 && <div className="table-scroll"><table><thead><tr><th>Item</th><th>Community</th><th>Observed</th><th>Views</th><th>Affiliation</th></tr></thead><tbody>{preview.rows.slice(0,10).map((row,index) => <tr key={`${row.external_id}-${index}`}><td>{row.external_id}</td><td>r/{row.subreddit}</td><td>{row.observed_at}</td><td>{row.views ?? "Unknown"}</td><td>{row.affiliation}</td></tr>)}</tbody></table></div>}
    </div>}
    <div className="form-actions"><button className="button primary" type="button" onClick={save} disabled={pending || !preview?.rows.length || Boolean(preview.errors.length) || !sourceNote.trim()}>{pending ? "Saving…" : batchId ? "Submit again" : "Commit valid evidence"}</button></div>
    {message && <div className={`notice ${messageIsError ? "error" : "success"}`} role="status">{message}</div>}
  </section>;
}
