"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { insertWithStableId } from "@/lib/idempotent-insert";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/analytics`;
const errorPath = (clientId: string, message: string) => `${path(clientId)}?error=${encodeURIComponent(message.slice(0,180))}`;
const optionalText = (max: number) => z.string().trim().max(max);

export async function recordAnalyticsObservation(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const schema = z.object({
    clientId: uuid,
    campaignId: z.union([uuid,z.literal("")]),
    supersedesId: z.union([uuid,z.literal("")]),
    sourceKind: z.enum(["ga4_export","other_authorized_export","manual_client_report"]),
    propertyReference: z.string().trim().min(1).max(160),
    propertyTimezone: z.string().trim().min(1).max(80),
    periodStart: z.iso.date(), periodEnd: z.iso.date(),
    dimensionScope: z.enum(["session","event"]),
    sourceName: z.string().trim().min(1).max(160), medium: z.string().trim().min(1).max(160),
    campaignTag: optionalText(160), contentTag: optionalText(160),
    metricName: z.enum(["sessions","key_events","revenue"]),
    eventName: optionalText(160), metricValue: z.coerce.number().finite().nonnegative().max(1e12),
    currency: optionalText(3).transform((value) => value.toUpperCase()),
    attributionNote: z.string().trim().min(1).max(1000),
    sourceNote: z.string().trim().min(1).max(2000),
  });
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(errorPath(clientId,"Check the analytics observation fields."));
  const value = parsed.data;
  if (value.periodStart > value.periodEnd
    || (new Date(value.periodEnd).getTime()-new Date(value.periodStart).getTime())/86400000 > 366
    || (value.metricName==="sessions" && (value.dimensionScope!=="session" || !Number.isInteger(value.metricValue) || value.eventName || value.currency))
    || (value.metricName==="key_events" && (!value.eventName || value.currency))
    || (value.metricName==="revenue" && (value.eventName || !/^[A-Z]{3}$/.test(value.currency)))
    || !/^\d+(?:\.\d{1,2})?$/.test(String(form.get("metricValue") ?? ""))) {
    redirect(errorPath(clientId,"Check the date range, metric scope, value, event name and currency."));
  }
  try { new Intl.DateTimeFormat("en",{timeZone:value.propertyTimezone}); }
  catch { redirect(errorPath(clientId,"Use an IANA property timezone, such as Asia/Kolkata.")); }
  const { db, client, role, userId } = await requireClient(clientId);
  if (!["owner","manager"].includes(role)) redirect(errorPath(clientId,"Analytics record access requires owner or manager."));
  const id = randomUUID();
  const { error } = await insertWithStableId(id,
    async () => db.from("analytics_observations").insert({
      id, organization_id: client.organization_id, client_id: clientId,
      campaign_id: value.campaignId || null, supersedes_id: value.supersedesId || null,
      source_kind: value.sourceKind, property_reference: value.propertyReference,
      property_timezone: value.propertyTimezone, period_start: value.periodStart, period_end: value.periodEnd,
      dimension_scope: value.dimensionScope, source_name: value.sourceName, medium: value.medium,
      campaign_tag: value.campaignTag || null, content_tag: value.contentTag || null,
      metric_name: value.metricName, event_name: value.eventName || null, metric_value: value.metricValue,
      currency: value.currency || null, attribution_note: value.attributionNote,
      source_note: value.sourceNote, created_by: userId,
    }).select("id").single(),
    async () => db.from("analytics_observations").select("id").eq("id",id).eq("client_id",clientId).maybeSingle());
  if (error) redirect(errorPath(clientId,error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?observation=${id}`);
}
