"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";
import { parseTimestamp } from "@/lib/reddit";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/campaigns`;
const errorPath = (clientId: string, message: string, campaignId?: string) =>
  `${path(clientId)}?error=${encodeURIComponent(message.slice(0, 180))}${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ""}`;

export async function reviseCampaign(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const campaignId = String(form.get("campaignId") ?? "");
  const parsed = z.object({
    clientId: uuid, campaignId: uuid, expectedVersion: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(160), goal: z.string().trim().max(2000),
    baselineStart: z.iso.date(), baselineEnd: z.iso.date(), comparisonStart: z.iso.date(), comparisonEnd: z.iso.date(),
    reason: z.string().trim().min(1).max(1000),
  }).safeParse({ clientId, campaignId, expectedVersion: form.get("expectedVersion"), name: form.get("name"),
    goal: form.get("goal") ?? "", baselineStart: form.get("baselineStart"), baselineEnd: form.get("baselineEnd"),
    comparisonStart: form.get("comparisonStart"), comparisonEnd: form.get("comparisonEnd"), reason: form.get("reason") });
  if (!parsed.success || parsed.data.baselineStart > parsed.data.baselineEnd ||
      parsed.data.baselineEnd >= parsed.data.comparisonStart || parsed.data.comparisonStart > parsed.data.comparisonEnd) {
    redirect(errorPath(clientId, "Check the campaign windows and change reason.", campaignId));
  }
  const { db, role } = await requireClient(clientId);
  if (!["owner", "manager", "researcher"].includes(role)) redirect(errorPath(clientId, "Campaign edit access required.", campaignId));
  const { error } = await retryIdempotentRequest(async () => db.rpc("revise_campaign", {
    p_client_id: clientId, p_campaign_id: campaignId, p_expected_version: parsed.data.expectedVersion,
    p_name: parsed.data.name, p_goal: parsed.data.goal, p_baseline_start: parsed.data.baselineStart,
    p_baseline_end: parsed.data.baselineEnd, p_comparison_start: parsed.data.comparisonStart,
    p_comparison_end: parsed.data.comparisonEnd, p_reason: parsed.data.reason,
  }));
  if (error) redirect(errorPath(clientId, error.message, campaignId));
  revalidatePath(path(clientId));
  revalidatePath(`/clients/${clientId}`);
  redirect(`${path(clientId)}?campaign=${campaignId}`);
}

export async function addCampaignEvent(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const campaignId = String(form.get("campaignId") ?? "");
  const parsed = z.object({
    clientId: uuid, campaignId: uuid,
    eventType: z.enum(["launch", "pricing_change", "advertising_change", "site_change", "other"]),
    occurredAt: z.string().trim().min(1).max(80), description: z.string().trim().min(1).max(2000),
    sourceNote: z.string().trim().min(1).max(2000),
  }).safeParse({ clientId, campaignId, eventType: form.get("eventType"), occurredAt: form.get("occurredAt"),
    description: form.get("description"), sourceNote: form.get("sourceNote") });
  if (!parsed.success) redirect(errorPath(clientId, "Check the event details.", campaignId));
  let occurredAt: string;
  try { occurredAt = parseTimestamp(parsed.data.occurredAt); }
  catch { redirect(errorPath(clientId, "Include a valid time and timezone offset.", campaignId)); }
  const { db, role } = await requireClient(clientId);
  if (!["owner", "manager", "researcher"].includes(role)) redirect(errorPath(clientId, "Campaign edit access required.", campaignId));
  const id = randomUUID();
  const { error } = await retryIdempotentRequest(async () => db.rpc("record_campaign_event", {
    p_id: id, p_client_id: clientId, p_campaign_id: campaignId, p_event_type: parsed.data.eventType,
    p_occurred_at: occurredAt, p_description: parsed.data.description, p_source_note: parsed.data.sourceNote,
  }));
  if (error) redirect(errorPath(clientId, error.message, campaignId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?campaign=${campaignId}#events`);
}
