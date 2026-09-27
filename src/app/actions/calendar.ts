"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";
import { parseTimestamp } from "@/lib/reddit";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/content`;
const errorPath = (clientId: string, message: string, draftId?: string) =>
  `${path(clientId)}?error=${encodeURIComponent(message.slice(0,180))}${draftId ? `&draft=${encodeURIComponent(draftId)}` : ""}`;

export async function scheduleApprovedDraft(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const draftId = String(form.get("draftId") ?? "");
  const parsed = z.object({ clientId: uuid, draftId: uuid, version: z.coerce.number().int().positive(),
    plannedAt: z.string().trim().min(1).max(80), subreddit: z.string().trim().regex(/^[A-Za-z0-9_]{2,40}$/),
    purpose: z.string().trim().min(1).max(1000),
  }).safeParse({ clientId,draftId,version:form.get("version"),plannedAt:form.get("plannedAt"),
    subreddit:form.get("subreddit"),purpose:form.get("purpose") });
  if (!parsed.success) redirect(errorPath(clientId,"Check the calendar date, community and purpose.",draftId));
  let plannedAt: string;
  try { plannedAt=parseTimestamp(parsed.data.plannedAt); }
  catch { redirect(errorPath(clientId,"Include a valid planned time with timezone offset.",draftId)); }
  if (new Date(plannedAt).getTime()<=Date.now()) redirect(errorPath(clientId,"Choose a future planned time.",draftId));
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager"].includes(role)) redirect(errorPath(clientId,"Calendar planning requires owner or manager.",draftId));
  const id = randomUUID();
  const { error } = await retryIdempotentRequest(async () => db.rpc("schedule_content_draft",{
    p_id:id,p_client_id:clientId,p_draft_id:draftId,p_version:parsed.data.version,
    p_planned_at:plannedAt,p_subreddit:parsed.data.subreddit,p_purpose:parsed.data.purpose,
  }));
  if (error) redirect(errorPath(clientId,error.message,draftId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?draft=${draftId}`);
}

export async function cancelDraftPlan(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const draftId = String(form.get("draftId") ?? "");
  const parsed = z.object({ clientId: uuid, entryId: uuid, draftId: uuid,
    reason: z.string().trim().min(1).max(1000) }).safeParse({clientId,draftId,
    entryId:form.get("entryId"),reason:form.get("reason")});
  if (!parsed.success) redirect(errorPath(clientId,"Add a cancellation reason.",draftId));
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager"].includes(role)) redirect(errorPath(clientId,"Calendar planning requires owner or manager.",draftId));
  const { error } = await retryIdempotentRequest(async () => db.rpc("cancel_content_plan",{
    p_client_id:clientId,p_entry_id:parsed.data.entryId,p_reason:parsed.data.reason,
  }));
  if (error) redirect(errorPath(clientId,error.message,draftId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?draft=${draftId}`);
}
