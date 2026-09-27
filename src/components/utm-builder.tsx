"use client";

import { useState } from "react";
import { buildRedditUtmUrl } from "@/lib/utm";

export function UtmBuilder({ campaignId, defaultDestination, contributions }: {
  campaignId: string; defaultDestination: string;
  contributions: { id: string; format: string; published_at: string }[];
}) {
  const [destination,setDestination] = useState(defaultDestination);
  const [contributionId,setContributionId] = useState("");
  const [copied,setCopied] = useState(false);
  let link = "";
  let error = "";
  try { if (destination.trim()) link = buildRedditUtmUrl(destination.trim(),campaignId,contributionId || undefined); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Invalid landing URL."; }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setCopied(false); }
  }
  return <div className="stack">
    <label>Approved landing URL<input type="url" value={destination} onChange={(event) => {setDestination(event.target.value);setCopied(false);}} placeholder="https://example.com/landing" /></label>
    <label>Recorded contribution, if this link belongs to one<select value={contributionId} onChange={(event) => {setContributionId(event.target.value);setCopied(false);}}><option value="">Campaign link only</option>{contributions.map((item) => <option key={item.id} value={item.id}>{item.format} · {new Date(item.published_at).toLocaleDateString("en")} · {item.id.slice(0,8)}</option>)}</select></label>
    {error && <p className="notice error" role="alert">{error}</p>}
    <label>Tagged link<input readOnly value={link} onFocus={(event) => event.target.select()} placeholder="Enter an HTTPS landing URL above" /></label>
    <div className="form-actions"><button className="button secondary" type="button" disabled={!link} onClick={copy}>{copied ? "Copied" : "Copy tagged link"}</button></div>
    <p className="muted small">Uses only opaque record IDs. Confirm the destination belongs to the client before sharing. A tagged visit is a measurement signal, not proof that Reddit activity caused a conversion.</p>
  </div>;
}
