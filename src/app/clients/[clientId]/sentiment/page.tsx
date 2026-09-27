import Link from "next/link";
import { z } from "zod";
import { reviewSentiment } from "@/app/actions/sentiment";
import { Shell } from "@/components/shell";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";
import { summarizeIndependentSentiment } from "@/lib/sentiment";

const labels = ["positive", "negative", "neutral", "mixed", "unclassified"];

export default async function Sentiment({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ item?: string; error?: string }>;
}) {
  const { clientId } = await params;
  const { item: requestedItem, error: actionError } = await searchParams;
  const { db, client, role } = await requireClient(clientId);
  const { data: items, error: itemsError } = await retryIdempotentRequest(async () => db.from("reddit_items")
    .select("id,external_id,canonical_url,subreddit,item_type,affiliation").eq("client_id", clientId)
    .order("created_at", { ascending: false }).limit(100));
  const itemIds = items?.map((item) => item.id) ?? [];
  const { data: reviews, error: reviewsError } = itemIds.length
    ? await retryIdempotentRequest(async () => db.from("sentiment_reviews").select("item_id,label,theme,review_note,version,reviewed_at").eq("client_id", clientId).in("item_id", itemIds))
    : { data: [], error: null };
  const selected = items?.find((item) => item.id === requestedItem) ?? items?.[0];
  const selectedReview = reviews?.find((review) => review.item_id === selected?.id);
  const { data: versions, error: versionsError } = selected
    ? await retryIdempotentRequest(async () => db.from("sentiment_review_versions").select("id,version,label,theme,review_note,reviewed_at").eq("client_id", clientId).eq("item_id", selected.id).order("version", { ascending: false }).limit(100))
    : { data: [], error: null };
  const summary = items && reviews && !itemsError && !reviewsError ? summarizeIndependentSentiment(items, reviews) : null;
  const canReview = ["owner", "manager", "researcher", "reviewer"].includes(role);
  const invalidSelection = requestedItem && z.uuid().safeParse(requestedItem).success && !items?.some((item) => item.id === requestedItem);

  return <Shell clientId={clientId} clientName={client.name}>
    <div className="page-heading"><div><div className="eyebrow">MANUAL SENTIMENT</div><h1>Discussion review</h1><p className="muted">Separate independent discussion from agency and paid records for {client.name}.</p></div><Link className="button secondary" href={`/clients/${clientId}`}>Back to evidence</Link></div>
    <div className="notice warning"><strong>Review the original context.</strong><p>These labels are human judgments of recorded items, not automated sentiment or complete Reddit coverage. Check source permissions and context before labeling. Changing a label preserves the earlier decision.</p></div>
    {actionError && <div className="notice error" role="alert">{actionError}</div>}
    {(itemsError || reviewsError || versionsError) && <div className="notice error" role="alert">Sentiment records could not load. Refresh to retry. {itemsError?.message || reviewsError?.message || versionsError?.message}</div>}
    {invalidSelection && <div className="notice warning">That item is outside the newest 100 accessible records; showing the newest item.</div>}
    <div className="summary-strip"><div><span className="eyebrow">INDEPENDENT CLASSIFIED</span><strong>{summary?.classified ?? "Unknown"} / {summary?.independentItems ?? "Unknown"}</strong></div><div><span className="eyebrow">POSITIVE MENTION SHARE</span><strong>{summary?.positiveShare === null || !summary ? "Unknown" : `${(summary.positiveShare * 100).toFixed(1)}%`}</strong></div><div><span className="eyebrow">EXCLUDED FROM INDEPENDENT</span><strong>{summary ? `${summary.excludedAgencyOrPaid} agency/paid · ${summary.unknownAffiliation} unknown affiliation` : "Unknown"}</strong></div></div>
    <p className="coverage-note">Cohort: newest {items?.length ?? 0} recorded items, at most 100. Positive share = positive independent labels / positive, negative, neutral and mixed independent labels. {summary ? `${summary.counts.unclassified} unclassified and ${summary.counts.unreviewed} unreviewed independent items are shown separately, not counted as negative or zero.` : "Summary paused until records load."} This sample is not a full-client sentiment trend.</p>
    <div className="content-columns"><section className="panel"><div className="panel-heading"><h2>Recorded items</h2><span className="pill">{items?.length ?? 0} shown</span></div>
      {items?.length ? <div className="record-list content-list">{items.map((item) => { const review = reviews?.find((entry) => entry.item_id === item.id); return <Link className={`draft-row${selected?.id === item.id ? " selected" : ""}`} href={`?item=${item.id}`} key={item.id}><strong>r/{item.subreddit} · {item.external_id}</strong><span className="tag">{item.affiliation.replaceAll("_", " ")}</span><span className="muted small">{review ? `${review.label} · version ${review.version}` : "Not reviewed"}</span></Link>; })}</div> : itemsError ? <div className="empty compact">Items unavailable.</div> : <div className="empty compact">No recorded Reddit items. Import permissioned evidence first.</div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>{selected ? `r/${selected.subreddit} · ${selected.external_id}` : "Selected item"}</h2><p className="muted small">{selected ? `${selected.item_type} · ${selected.affiliation.replaceAll("_", " ")}` : "Select an item to review it."}</p></div></div>
      {selected && <div className="draft-detail"><p><a href={selected.canonical_url} target="_blank" rel="noreferrer">Open original Reddit item ↗</a></p><p><strong>Current label:</strong> {reviewsError ? "Unavailable" : selectedReview?.label ?? "Not reviewed"}{selectedReview?.theme ? ` · Theme: ${selectedReview.theme}` : ""}</p>{selectedReview && <p className="muted small">Review note: {selectedReview.review_note}</p>}
        {canReview && !reviewsError && <form action={reviewSentiment} className="stack"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="itemId" value={selected.id} /><input type="hidden" name="expectedVersion" value={selectedReview?.version ?? 0} />
          <label>Sentiment<select name="label" defaultValue={selectedReview?.label ?? "unclassified"}>{labels.map((label) => <option value={label} key={label}>{label}</option>)}</select></label>
          <label>Theme<input name="theme" maxLength={160} defaultValue={selectedReview?.theme ?? ""} placeholder="Price, support, product quality…" /></label>
          <label>Review note<textarea name="note" required maxLength={2000} rows={3} defaultValue={selectedReview?.review_note ?? ""} placeholder="Explain the label and any uncertainty" /></label><button className="button primary">Save review version</button>
        </form>}
        <div className="draft-history"><h3>Review history</h3>{versions?.length ? versions.map((version) => <div className="campaign-version" key={version.id}><strong>Version {version.version}</strong> <span className="tag">{version.label}</span><p className="muted small">{version.theme ? `Theme: ${version.theme} · ` : ""}{version.review_note}</p><p className="muted small">Reviewed {new Date(version.reviewed_at).toLocaleString("en")}</p></div>) : <p className="muted small">No review history.</p>}{versions?.length === 100 && <p className="muted small">Only the latest 100 versions are shown.</p>}</div>
      </div>}
    </section></div>
  </Shell>;
}
