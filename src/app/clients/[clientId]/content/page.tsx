import Link from "next/link";
import { z } from "zod";
import { createDraft, reviseDraft, reviewDraft } from "@/app/actions/content";
import { Shell } from "@/components/shell";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export default async function Content({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ error?: string; draft?: string }>;
}) {
  const { clientId } = await params;
  const { error: actionError, draft: requestedDraft } = await searchParams;
  const { db, client, role } = await requireClient(clientId);
  const [{ data: drafts, error: draftsError }, { data: campaigns, error: campaignsError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("content_drafts").select("id,current_title,current_version,status,updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("campaigns").select("id,name").eq("client_id", clientId).order("name").limit(100)),
    retryIdempotentRequest(async () => db.from("opportunities").select("id,title,subreddit").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100)),
  ]);
  const selectedId = z.uuid().safeParse(requestedDraft).success ? requestedDraft! : drafts?.[0]?.id;
  const [{ data: selected, error: selectedError }, { data: versions, error: versionsError }, { data: events, error: eventsError }] = selectedId ? await Promise.all([
    retryIdempotentRequest(async () => db.from("content_drafts").select("id,campaign_id,opportunity_id,current_title,current_body,current_source_note,current_version,status,created_at,updated_at,approved_at").eq("client_id", clientId).eq("id", selectedId).maybeSingle()),
    retryIdempotentRequest(async () => db.from("content_draft_versions").select("id,version,title,body,source_note,created_at").eq("client_id", clientId).eq("draft_id", selectedId).order("version", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("content_review_events").select("id,version,decision,note,created_at").eq("client_id", clientId).eq("draft_id", selectedId).order("created_at", { ascending: false }).limit(100)),
  ]) : [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }];
  const canEdit = ["owner", "manager", "researcher", "writer"].includes(role);
  const canReview = ["owner", "manager", "reviewer"].includes(role);
  const loadError = draftsError || campaignsError || opportunitiesError || selectedError || versionsError || eventsError;

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">CONTENT WORKFLOW</div><h1>Drafts &amp; review</h1><p className="muted">Versioned internal content for {client.name}.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to overview</Link></div>
    <div className="notice warning"><strong>Human approval only.</strong><p>Drafts are manual and stay inside this workspace. Approval records an internal decision; it does not publish to Reddit or any other channel. Check community rules and claims before using a draft elsewhere.</p></div>
    {actionError && <div className="notice error" role="alert">{actionError}</div>}
    {loadError && <div className="notice error" role="alert">Some content could not load. Refresh to retry. {loadError.message}</div>}

    {canEdit && <section className="panel"><div className="panel-heading"><div><h2>Create a draft</h2><p className="muted small">Write a helpful response with a traceable source note.</p></div></div>
      <form action={createDraft} className="form-grid"><input type="hidden" name="clientId" value={clientId} />
        <label>Title<input name="title" required maxLength={500} placeholder="Internal working title" /></label>
        <label>Campaign<select name="campaignId" defaultValue=""><option value="">No campaign</option>{campaigns?.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}</select></label>
        <label>Opportunity<select name="opportunityId" defaultValue=""><option value="">No opportunity</option>{opportunities?.map((opportunity) => <option value={opportunity.id} key={opportunity.id}>r/{opportunity.subreddit}: {opportunity.title}</option>)}</select></label>
        <label>Source and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} placeholder="Source of claims and permission to use the material" /></label>
        <label className="wide-field">Draft body<textarea name="body" required maxLength={20000} rows={7} placeholder="Write the proposed response here. Nothing is published from this form." /></label>
        <div className="form-actions"><button className="button primary">Save draft</button></div>
      </form></section>}

    <div className="content-columns"><section className="panel"><div className="panel-heading"><div><h2>Draft queue</h2><p className="muted small">The newest 100 drafts appear here.</p></div><span className="pill">{drafts?.length ?? 0} shown</span></div>
      {drafts?.length ? <div className="record-list content-list">{drafts.map((draft) => <Link className={`draft-row${selectedId === draft.id ? " selected" : ""}`} href={`?draft=${draft.id}`} key={draft.id}><strong>{draft.current_title}</strong><span className="tag">{draft.status.replaceAll("_", " ")}</span><span className="muted small">Version {draft.current_version} · Updated {new Date(draft.updated_at).toLocaleDateString("en")}</span></Link>)}</div> : draftsError ? <div className="empty compact">Drafts unavailable.</div> : <div className="empty compact">No drafts yet.</div>}
    </section>

    <section className="panel"><div className="panel-heading"><div><h2>{selected?.current_title ?? "Selected draft"}</h2><p className="muted small">{selected ? `Version ${selected.current_version} · ${selected.status.replaceAll("_", " ")}` : "Select a draft to review it."}</p></div>{selected && <span className="pill">{selected.status.replaceAll("_", " ")}</span>}</div>
      {selected ? <div className="draft-detail"><p className="draft-body">{selected.current_body}</p><p className="muted small">Source: {selected.current_source_note}</p><p className="muted small">Created {new Date(selected.created_at).toLocaleString("en")} · Updated {new Date(selected.updated_at).toLocaleString("en")}{selected.approved_at ? ` · Approved ${new Date(selected.approved_at).toLocaleString("en")}` : ""}</p>
        {canEdit && <details className="review-detail"><summary>Write a new version</summary><form action={reviseDraft} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="draftId" value={selected.id} /><input type="hidden" name="expectedVersion" value={selected.current_version} />
          <label>Title<input name="title" required maxLength={500} defaultValue={selected.current_title} /></label>
          <label>Body<textarea name="body" required maxLength={20000} rows={8} defaultValue={selected.current_body} /></label>
          <label>Source and permission note<textarea name="sourceNote" required maxLength={2000} rows={2} defaultValue={selected.current_source_note} /></label>
          <button className="button secondary">Save new version</button>
        </form></details>}
        {canEdit && ["draft", "revision_requested"].includes(selected.status) && <form action={reviewDraft} className="review-action"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="draftId" value={selected.id} /><input type="hidden" name="version" value={selected.current_version} /><input type="hidden" name="decision" value="submit" /><button className="button primary">Submit for internal review</button></form>}
        {canReview && selected.status === "internal_review" && <div className="review-actions"><form action={reviewDraft} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="draftId" value={selected.id} /><input type="hidden" name="version" value={selected.current_version} /><input type="hidden" name="decision" value="approve" /><label>Review note<textarea name="note" maxLength={2000} rows={2} placeholder="Claims, sources, and rules checked" /></label><button className="button primary">Approve internally</button></form>
          <form action={reviewDraft} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="draftId" value={selected.id} /><input type="hidden" name="version" value={selected.current_version} /><input type="hidden" name="decision" value="request_revision" /><label>Revision request<textarea name="note" required maxLength={2000} rows={2} placeholder="What needs to change?" /></label><button className="button secondary">Request revision</button></form></div>}
        <div className="draft-history"><h3>Version history</h3>{versions?.map((version) => <details key={version.id}><summary>Version {version.version} · {version.title} · {new Date(version.created_at).toLocaleString("en")}</summary><p className="draft-body">{version.body}</p><p className="muted small">Source: {version.source_note}</p></details>)}{versions?.length === 100 && <p className="muted small">Only the latest 100 versions are shown.</p>}
          <h3>Review history</h3>{events?.length ? events.map((event) => <p className="small" key={event.id}><span className="tag">{event.decision.replaceAll("_", " ")}</span> Version {event.version} · {new Date(event.created_at).toLocaleString("en")}{event.note ? ` · ${event.note}` : ""}</p>) : <p className="muted small">No review decisions yet.</p>}{events?.length === 100 && <p className="muted small">Only the latest 100 events are shown.</p>}</div>
      </div> : selectedError ? <div className="empty compact">Draft unavailable.</div> : <div className="empty compact">No selected draft.</div>}
    </section></div>
  </Shell>;
}
