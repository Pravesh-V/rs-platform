"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient, requireUser } from "@/lib/auth";
import { parseRedditUrl, parseTimestamp } from "@/lib/reddit";

const uuid = z.string().uuid();
const optionalHttpsUrl = z.union([
  z.literal(""),
  z.url().max(500).refine((value) => new URL(value).protocol === "https:", "Use an HTTPS URL."),
]);

function queryError(error: string) {
  return encodeURIComponent(error.slice(0, 180));
}

export async function createClient(form: FormData) {
  const input = z.object({ organizationId: uuid, name: z.string().trim().min(1).max(160), website: optionalHttpsUrl, timezone: z.string().min(1).max(80) }).safeParse({
    organizationId: form.get("organizationId"), name: form.get("name"), website: form.get("website") ?? "", timezone: form.get("timezone") ?? "UTC",
  });
  if (!input.success) redirect("/clients?error=Check%20the%20client%20details");
  try { new Intl.DateTimeFormat("en", { timeZone: input.data.timezone }); } catch { redirect("/clients?error=Invalid%20timezone"); }
  const { db, userId } = await requireUser();
  const { data: member } = await db.from("memberships").select("role").eq("organization_id", input.data.organizationId).eq("user_id", userId).maybeSingle();
  if (member?.role !== "owner") redirect("/clients?error=Owner%20access%20required");
  const { data, error } = await db.from("clients").insert({ organization_id: input.data.organizationId, name: input.data.name, website: input.data.website || null, timezone: input.data.timezone }).select("id").single();
  if (error || !data) redirect(`/clients?error=${queryError(error?.message ?? "Could not create client")}`);
  redirect(`/clients/${data.id}`);
}

export async function createFact(form: FormData) {
  const input = z.object({ clientId: uuid, kind: z.enum(["product","alias","positioning","customer","differentiator","pricing","prohibited_claim","tone","objective","other"]), statement: z.string().trim().min(1).max(5000), sourceUrl: optionalHttpsUrl, verifiedAt: z.union([z.literal(""),z.iso.date()]) }).safeParse({
    clientId: form.get("clientId"), kind: form.get("kind"), statement: form.get("statement"), sourceUrl: form.get("sourceUrl") ?? "", verifiedAt: form.get("verifiedAt") ?? "",
  });
  const clientId = String(form.get("clientId") ?? "");
  if (!input.success) redirect(`/clients/${clientId}?error=Check%20the%20fact`);
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager","researcher"].includes(role)) redirect(`/clients/${clientId}?error=Edit%20access%20required`);
  const { error } = await db.from("client_facts").insert({ client_id: clientId, kind: input.data.kind, statement: input.data.statement, source_url: input.data.sourceUrl || null, verified_at: input.data.verifiedAt || null });
  if (error) redirect(`/clients/${clientId}?error=${queryError(error.message)}`);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}#facts`);
}

export async function createCampaign(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const input = z.object({ clientId: uuid, name: z.string().trim().min(1).max(160), goal: z.string().trim().max(2000), baselineStart: z.iso.date(), baselineEnd: z.iso.date(), comparisonStart: z.iso.date(), comparisonEnd: z.iso.date() }).safeParse({
    clientId, name: form.get("name"), goal: form.get("goal") ?? "", baselineStart: form.get("baselineStart"), baselineEnd: form.get("baselineEnd"), comparisonStart: form.get("comparisonStart"), comparisonEnd: form.get("comparisonEnd"),
  });
  if (!input.success || input.data.baselineStart > input.data.baselineEnd || input.data.baselineEnd >= input.data.comparisonStart || input.data.comparisonStart > input.data.comparisonEnd) redirect(`/clients/${clientId}?error=Check%20the%20campaign%20dates`);
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager","researcher"].includes(role)) redirect(`/clients/${clientId}?error=Edit%20access%20required`);
  const { error } = await db.from("campaigns").insert({ client_id: clientId, name: input.data.name, goal: input.data.goal || null, baseline_start: input.data.baselineStart, baseline_end: input.data.baselineEnd, comparison_start: input.data.comparisonStart, comparison_end: input.data.comparisonEnd });
  if (error) redirect(`/clients/${clientId}?error=${queryError(error.message)}`);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}#campaigns`);
}

export async function recordContribution(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const { db, role } = await requireClient(clientId);
  try {
    const input = z.object({ clientId: uuid, campaignId: z.union([z.literal(""),uuid]), url: z.string().url(), title: z.string().max(500), format: z.enum(["post","comment","faq","tutorial","comparison","other"]), publishedAt: z.string() }).parse({
      clientId, campaignId: form.get("campaignId") ?? "", url: form.get("url"), title: form.get("title") ?? "", format: form.get("format"), publishedAt: form.get("publishedAt"),
    });
    const item = parseRedditUrl(input.url);
    const publishedAt = parseTimestamp(input.publishedAt);
    if (!["owner","manager","researcher","writer"].includes(role)) throw new Error("Contribution access required.");
    const { error } = await db.rpc("record_contribution", {
      p_client_id: clientId, p_campaign_id: input.campaignId || null, p_external_id: item.externalId, p_canonical_url: item.canonicalUrl,
      p_subreddit: item.subreddit, p_item_type: item.itemType, p_title: input.title, p_format: input.format, p_published_at: publishedAt,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(`/clients/${clientId}?error=${queryError(error instanceof Error ? error.message : "Invalid contribution")}`);
  }
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}#contributions`);
}
