"use client";

import { useState } from "react";

export function ApprovedCopy({ body, version }: { body: string; version: number }) {
  const [result, setResult] = useState<"idle" | "copied" | "unavailable">("idle");

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      setResult("copied");
    } catch {
      setResult("unavailable");
    }
  }

  return <div className="stack">
    <div className="form-actions"><button className="button secondary" type="button" onClick={copyBody}>{result === "copied" ? "Copied approved body" : "Copy approved body"}</button></div>
    {result === "copied" && <p className="muted small" role="status">Version {version} copied. Check the live discussion and community rules before posting manually.</p>}
    {result === "unavailable" && <label>Clipboard unavailable. Select and copy the approved body here.
      <textarea readOnly value={body} rows={7} onFocus={(event) => event.target.select()} />
    </label>}
  </div>;
}
