"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/content`;
const errorPath = (clientId: string, message: string, draftId?: string) =>
  `${path(clientId)}?error=${encodeURIComponent(message.slice(0, 180))}${draftId ? `&draft=${encodeURIComponent(draftId)}` : ""}`;
const contentFields = {
  clientId: uuid,
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20000),
  sourceNote: z.string().trim().min(1).max(2000),
};
const canEdit = (role: string) => ["owner", "manager", "researcher", "writer"].includes(role);

export async function createDraft(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const parsed = z.object({ ...contentFields, campaignId: z.union([z.literal(""), uuid]), opportunityId: z.union([z.literal(""), uuid]) }).safeParse({
    clientId, title: form.get("title"), body: form.get("body"), sourceNote: form.get("sourceNote"),
    campaignId: form.get("campaignId") ?? "", opportunityId: form.get("opportunityId") ?? "",
  });
  if (!parsed.success) redirect(errorPath(clientId, "Check the draft fields and source note."));
  const { db, role } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId, "Draft edit access required."));
  const draftId = randomUUID();
  const { error } = await retryIdempotentRequest(async () => db.rpc("create_content_draft", {
    p_id: draftId, p_client_id: clientId, p_campaign_id: parsed.data.campaignId || null,
    p_opportunity_id: parsed.data.opportunityId || null, p_title: parsed.data.title,
    p_body: parsed.data.body, p_source_note: parsed.data.sourceNote,
  }));
  if (error) redirect(errorPath(clientId, error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?draft=${draftId}`);
}

export async function reviseDraft(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const draftId = String(form.get("draftId") ?? "");
  const parsed = z.object({ ...contentFields, draftId: uuid, expectedVersion: z.coerce.number().int().positive() }).safeParse({
    clientId, draftId, expectedVersion: form.get("expectedVersion"), title: form.get("title"),
    body: form.get("body"), sourceNote: form.get("sourceNote"),
  });
  if (!parsed.success) redirect(errorPath(clientId, "Check the revision fields.", draftId));
  const { db, role } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId, "Draft edit access required.", draftId));
  const { error } = await retryIdempotentRequest(async () => db.rpc("revise_content_draft", {
    p_client_id: clientId, p_draft_id: draftId, p_expected_version: parsed.data.expectedVersion,
    p_title: parsed.data.title, p_body: parsed.data.body, p_source_note: parsed.data.sourceNote,
  }));
  if (error) redirect(errorPath(clientId, error.message, draftId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?draft=${draftId}`);
}

export async function reviewDraft(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const draftId = String(form.get("draftId") ?? "");
  const parsed = z.object({
    clientId: uuid, draftId: uuid, version: z.coerce.number().int().positive(),
    decision: z.enum(["submit", "approve", "request_revision"]), note: z.string().trim().max(2000),
  }).safeParse({ clientId, draftId, version: form.get("version"), decision: form.get("decision"), note: form.get("note") ?? "" });
  if (!parsed.success) redirect(errorPath(clientId, "Check the review action.", draftId));
  if (parsed.data.decision === "request_revision" && !parsed.data.note) redirect(errorPath(clientId, "Explain the requested revision.", draftId));
  const { db, role } = await requireClient(clientId);
  if (parsed.data.decision === "submit" ? !canEdit(role) : !["owner", "manager", "reviewer"].includes(role)) {
    redirect(errorPath(clientId, "Review access required.", draftId));
  }
  const { error } = await retryIdempotentRequest(async () => db.rpc("review_content_draft", {
    p_client_id: clientId, p_draft_id: draftId, p_version: parsed.data.version,
    p_decision: parsed.data.decision, p_note: parsed.data.note || null,
  }));
  if (error) redirect(errorPath(clientId, error.message, draftId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?draft=${draftId}`);
}
