"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { insertWithStableId, retryIdempotentRequest } from "@/lib/idempotent-insert";
import { parseRedditUrl, parseTimestamp } from "@/lib/reddit";

const uuid = z.string().uuid();
const subreddit = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,80}$/);
const optionalHttps = z.union([z.literal(""), z.url().max(500).refine((value) => new URL(value).protocol === "https:")]);
const path = (clientId: string) => `/clients/${clientId}/research`;
const errorPath = (clientId: string, message: string) => `${path(clientId)}?error=${encodeURIComponent(message.slice(0, 180))}`;

export async function addCommunity(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const input = z.object({
    clientId: uuid, subreddit, relevanceNote: z.string().trim().min(1).max(2000),
    activityNote: z.string().trim().max(2000), rulesUrl: optionalHttps,
    rulesSummary: z.string().trim().max(5000), rulesCheckedAt: z.union([z.literal(""), z.iso.date()]),
    promotionPolicy: z.enum(["unknown","allowed","restricted","not_allowed"]),
    sourceNote: z.string().trim().min(1).max(2000),
  }).safeParse({
    clientId, subreddit: String(form.get("subreddit") ?? "").replace(/^r\//i, ""),
    relevanceNote: form.get("relevanceNote"), activityNote: form.get("activityNote") ?? "",
    rulesUrl: form.get("rulesUrl") ?? "", rulesSummary: form.get("rulesSummary") ?? "",
    rulesCheckedAt: form.get("rulesCheckedAt") ?? "", promotionPolicy: form.get("promotionPolicy") ?? "unknown",
    sourceNote: form.get("sourceNote"),
  });
  if (!input.success) redirect(errorPath(clientId, "Check the community research details."));
  const { db, userId, role } = await requireClient(clientId);
  if (!["owner","manager","researcher"].includes(role)) redirect(errorPath(clientId, "Research edit access required."));
  const id = randomUUID();
  const { error } = await insertWithStableId(
    id,
    async () => db.from("community_research").insert({
      id, client_id: clientId, subreddit: input.data.subreddit, relevance_note: input.data.relevanceNote,
      activity_note: input.data.activityNote || null, rules_url: input.data.rulesUrl || null,
      rules_summary: input.data.rulesSummary || null, rules_checked_at: input.data.rulesCheckedAt || null,
      promotion_policy: input.data.promotionPolicy, source_note: input.data.sourceNote, created_by: userId,
    }).select("id").single(),
    async () => db.from("community_research").select("id").eq("id", id).eq("client_id", clientId).maybeSingle(),
  );
  if (error) redirect(errorPath(clientId, error.code === "23505" ? "This community is already recorded for the client." : error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}#communities`);
}

export async function addOpportunity(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const input = z.object({
    clientId: uuid, url: z.url(), title: z.string().trim().min(1).max(500),
    contextNote: z.string().trim().min(1).max(5000), suggestedAngle: z.string().trim().max(5000),
    priority: z.enum(["low","medium","high"]), priorityReason: z.string().trim().min(1).max(2000),
    sourceNote: z.string().trim().min(1).max(2000), observedAt: z.string().trim().max(80),
  }).safeParse({
    clientId, url: form.get("url"), title: form.get("title"), contextNote: form.get("contextNote"),
    suggestedAngle: form.get("suggestedAngle") ?? "", priority: form.get("priority") ?? "medium",
    priorityReason: form.get("priorityReason"), sourceNote: form.get("sourceNote"),
    observedAt: form.get("observedAt") ?? "",
  });
  if (!input.success) redirect(errorPath(clientId, "Check the opportunity details."));
  let item: ReturnType<typeof parseRedditUrl>;
  let observedAt: string;
  try {
    item = parseRedditUrl(input.data.url);
    observedAt = input.data.observedAt ? parseTimestamp(input.data.observedAt) : new Date().toISOString();
  } catch (error) {
    redirect(errorPath(clientId, error instanceof Error ? error.message : "Invalid Reddit URL or timestamp."));
  }
  const { db, userId, role } = await requireClient(clientId);
  if (!["owner","manager","researcher"].includes(role)) redirect(errorPath(clientId, "Research edit access required."));
  const id = randomUUID();
  const { error } = await insertWithStableId(
    id,
    async () => db.from("opportunities").insert({
      id, client_id: clientId, external_id: item.externalId, canonical_url: item.canonicalUrl,
      subreddit: item.subreddit, title: input.data.title, context_note: input.data.contextNote,
      suggested_angle: input.data.suggestedAngle || null, priority: input.data.priority,
      priority_reason: input.data.priorityReason, source_note: input.data.sourceNote,
      observed_at: observedAt, created_by: userId,
    }).select("id").single(),
    async () => db.from("opportunities").select("id").eq("id", id).eq("client_id", clientId).maybeSingle(),
  );
  if (error) redirect(errorPath(clientId, error.code === "23505" ? "This Reddit item is already in the client's queue." : error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}#opportunities`);
}

export async function setOpportunityStatus(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const input = z.object({ clientId: uuid, opportunityId: uuid, status: z.enum(["new","reviewed","assigned","drafted","dismissed"]) }).safeParse({
    clientId, opportunityId: form.get("opportunityId"), status: form.get("status"),
  });
  if (!input.success) redirect(errorPath(clientId, "Invalid opportunity update."));
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager","researcher"].includes(role)) redirect(errorPath(clientId, "Research edit access required."));
  const { error } = await retryIdempotentRequest(async () => db.rpc("set_opportunity_status", {
    p_client_id: clientId, p_opportunity_id: input.data.opportunityId, p_status: input.data.status,
  }));
  if (error) redirect(errorPath(clientId, error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}#opportunities`);
}
