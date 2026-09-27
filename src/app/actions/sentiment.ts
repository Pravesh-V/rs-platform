"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

const path = (clientId: string) => `/clients/${clientId}/sentiment`;
const errorPath = (clientId: string, itemId: string, message: string) =>
  `${path(clientId)}?item=${encodeURIComponent(itemId)}&error=${encodeURIComponent(message.slice(0, 180))}`;

export async function reviewSentiment(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const itemId = String(form.get("itemId") ?? "");
  const parsed = z.object({
    clientId: z.uuid(), itemId: z.uuid(), expectedVersion: z.coerce.number().int().min(0),
    label: z.enum(["positive", "negative", "neutral", "mixed", "unclassified"]),
    theme: z.string().trim().max(160), note: z.string().trim().min(1).max(2000),
  }).safeParse({ clientId, itemId, expectedVersion: form.get("expectedVersion"), label: form.get("label"),
    theme: form.get("theme") ?? "", note: form.get("note") });
  if (!parsed.success) redirect(errorPath(clientId, itemId, "Check the sentiment review fields."));
  const { db, role } = await requireClient(clientId);
  if (!["owner", "manager", "researcher", "reviewer"].includes(role)) redirect(errorPath(clientId, itemId, "Review access required."));
  const { error } = await retryIdempotentRequest(async () => db.rpc("review_reddit_sentiment", {
    p_client_id: clientId, p_item_id: itemId, p_expected_version: parsed.data.expectedVersion,
    p_label: parsed.data.label, p_theme: parsed.data.theme || null, p_review_note: parsed.data.note,
  }));
  if (error) redirect(errorPath(clientId, itemId, error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?item=${itemId}`);
}
