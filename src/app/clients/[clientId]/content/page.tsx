import Link from "next/link";
import { z } from "zod";
import { createDraft, reviseDraft, reviewDraft } from "@/app/actions/content";
import { cancelDraftPlan, scheduleApprovedDraft } from "@/app/actions/calendar";
import { recordContribution } from "@/app/actions/records";
import { ApprovedCopy } from "@/components/approved-copy";
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
  const [{ data: drafts, error: draftsError }, { data: campaigns, error: campaignsError }, { data: opportunities, error: opportunitiesError },
    { data: plans, count: planCount, error: plansError }] = await Promise.all([
    retryIdempotentRequest(async () => db.from("content_drafts").select("id,current_title,current_version,status,updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("campaigns").select("id,name").eq("client_id", clientId).order("name").limit(100)),
    retryIdempotentRequest(async () => db.from("opportunities").select("id,title,subreddit").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("content_calendar_entries")
      .select("id,draft_id,draft_version,planned_at,subreddit,purpose,status,cancellation_reason,created_at",{count:"exact"})
      .eq("client_id",clientId).order("created_at",{ascending:false}).limit(100)),
  ]);
  const selectedId = z.uuid().safeParse(requestedDraft).success ? requestedDraft! : drafts?.[0]?.id;
  const [{ data: selected, error: selectedError }, { data: versions, error: versionsError }, { data: events, error: eventsError }] = selectedId ? await Promise.all([
    retryIdempotentRequest(async () => db.from("content_drafts").select("id,campaign_id,opportunity_id,current_title,current_body,current_source_note,current_version,status,created_at,updated_at,approved_at").eq("client_id", clientId).eq("id", selectedId).maybeSingle()),
    retryIdempotentRequest(async () => db.from("content_draft_versions").select("id,version,title,body,source_note,created_at").eq("client_id", clientId).eq("draft_id", selectedId).order("version", { ascending: false }).limit(100)),
    retryIdempotentRequest(async () => db.from("content_review_events").select("id,version,decision,note,created_at").eq("client_id", clientId).eq("draft_id", selectedId).order("created_at", { ascending: false }).limit(100)),
  ]) : [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }];
  const canEdit = ["owner", "manager", "researcher", "writer"].includes(role);
  const canReview = ["owner", "manager", "reviewer"].includes(role);
  const canPlan = ["owner", "manager"].includes(role);
  const activePlanForSelected = plans?.find((plan) => plan.draft_id===selected?.id && plan.status==="planned");
  const plansCapped = planCount !== null && planCount > (plans?.length ?? 0);
  const loadError = draftsError || campaignsError || opportunitiesError || selectedError || versionsError || eventsError || plansError;

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
        {canEdit && selected.status === "approved" && <div className="review-detail"><h3>Ready for manual publication</h3><p className="muted small">Copy this approved version only after checking the current conversation, claims, and community rules. Copying does not publish it.</p><ApprovedCopy key={`${selected.id}:${selected.current_version}`} body={selected.current_body} version={selected.current_version} />
          <details className="review-detail"><summary>Record the publication after posting</summary><form action={recordContribution} className="stack"><input type="hidden" name="clientId" value={clientId} />
            <label>Actual Reddit URL<input name="url" type="url" required placeholder="https://www.reddit.com/r/.../comments/..." /></label>
            <label>Title or description<input name="title" maxLength={500} placeholder="What was actually published" /></label>
            <label>Campaign<select name="campaignId" defaultValue={selected.campaign_id ?? ""}><option value="">No campaign</option>{selected.campaign_id && !campaigns?.some((campaign) => campaign.id === selected.campaign_id) && <option value={selected.campaign_id}>Draft&apos;s assigned campaign</option>}{campaigns?.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}</select></label>
            <label>Format<select name="format"><option value="post">Post</option><option value="comment">Comment</option><option value="faq">FAQ</option><option value="tutorial">Tutorial</option><option value="comparison">Comparison</option><option value="other">Other</option></select></label>
            <label>Publication time with timezone offset<input name="publishedAt" required placeholder="2026-09-28T12:30:00+05:30" /></label>
            <button className="button primary">Record published URL</button>
            <p className="muted small">This records a user-reported URL against the client and selected campaign. It does not verify the post or prove that this exact draft version was used.</p>
          </form></details>
        </div>}
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
    <section className="panel"><div className="panel-heading"><div><h2>Content calendar</h2><p className="muted small">Internal plans for approved drafts. A revision automatically cancels the old plan. Planning never publishes content.</p></div><span className="pill">{planCount ?? plans?.length ?? 0} entries</span></div>
      {plansCapped && <div className="notice warning">Showing the newest 100 entries. Older calendar history needs pagination.</div>}
      {canPlan && selected?.status==="approved" && !activePlanForSelected && !plansCapped && !plansError && <details className="add-detail"><summary>Plan this approved version</summary><form action={scheduleApprovedDraft} className="form-grid"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="draftId" value={selected.id} /><input type="hidden" name="version" value={selected.current_version} />
        <label>Planned time with timezone offset<input name="plannedAt" required placeholder="2026-10-15T12:00:00+05:30" /></label>
        <label>Community without r/<input name="subreddit" required maxLength={40} pattern="[A-Za-z0-9_]{2,40}" placeholder="community" /></label>
        <label className="wide-field">Purpose and rules note<textarea name="purpose" required maxLength={1000} rows={2} placeholder="Why this community and timing are appropriate; confirm its current rules before posting" /></label>
        <div className="form-actions"><button className="button primary">Save plan</button></div>
      </form></details>}
      {selected?.status==="approved" && activePlanForSelected && <p className="coverage-note">This draft already has a planned entry. Cancel it before choosing a different date.</p>}
      {plans?.length ? <div className="record-list">{plans.map((plan) => <div className="record" key={plan.id}><div className="record-heading"><strong>{drafts?.find((draft) => draft.id===plan.draft_id)?.current_title ?? `Draft ${plan.draft_id.slice(0,8)}`} · v{plan.draft_version}</strong><span className="tag">{plan.status}</span></div>
        <p className="small">r/{plan.subreddit} · {new Date(plan.planned_at).toLocaleString("en",{dateStyle:"medium",timeStyle:"short"})} · {plan.purpose}</p>
        {plan.cancellation_reason && <p className="muted small">Cancelled: {plan.cancellation_reason}</p>}
        {canPlan && plan.status==="planned" && <details className="review-detail"><summary>Cancel this plan</summary><form action={cancelDraftPlan} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="draftId" value={plan.draft_id} /><input type="hidden" name="entryId" value={plan.id} /><label>Reason<textarea name="reason" required maxLength={1000} rows={2} /></label><button className="button secondary">Cancel plan</button></form></details>}
      </div>)}</div> : plansError ? <div className="empty compact">Calendar unavailable.</div> : <div className="empty compact">No content planned yet.</div>}
    </section>
  </Shell>;
}
