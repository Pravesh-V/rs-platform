"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/reports`;
const errorPath = (clientId: string, message: string) => `${path(clientId)}?error=${encodeURIComponent(message.slice(0,180))}`;

export async function createReportSnapshot(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const parsed = z.object({
    clientId: uuid, campaignId: uuid,
    reportMonth: z.iso.date().refine((value) => value.endsWith("-01")),
    executiveSummary: z.string().trim().min(1).max(5000),
    nextSteps: z.string().trim().min(1).max(5000),
    limitations: z.string().trim().min(1).max(5000),
  }).safeParse({ clientId, campaignId: form.get("campaignId"), reportMonth: `${String(form.get("reportMonth") ?? "")}-01`,
    executiveSummary: form.get("executiveSummary"), nextSteps: form.get("nextSteps"), limitations: form.get("limitations") });
  if (!parsed.success) redirect(errorPath(clientId,"Check the report month, campaign, and narrative."));
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager"].includes(role)) redirect(errorPath(clientId,"Report access required."));
  const id = randomUUID();
  const { error } = await retryIdempotentRequest(async () => db.rpc("create_report_snapshot", {
    p_id: id, p_client_id: clientId, p_campaign_id: parsed.data.campaignId,
    p_report_month: parsed.data.reportMonth, p_executive_summary: parsed.data.executiveSummary,
    p_next_steps: parsed.data.nextSteps, p_limitations: parsed.data.limitations,
  }));
  if (error) redirect(errorPath(clientId,error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?report=${id}`);
}

export async function approveReportSnapshot(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const parsed = z.object({ clientId: uuid, reportId: uuid, note: z.string().trim().min(1).max(2000) })
    .safeParse({ clientId, reportId: form.get("reportId"), note: form.get("note") });
  if (!parsed.success) redirect(errorPath(clientId,"Add a review note before approving."));
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager"].includes(role)) redirect(errorPath(clientId,"Report approval access required."));
  const { error } = await retryIdempotentRequest(async () => db.rpc("approve_report_snapshot", {
    p_client_id: clientId, p_report_id: parsed.data.reportId, p_note: parsed.data.note,
  }));
  if (error) redirect(errorPath(clientId,error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?report=${parsed.data.reportId}`);
}

export async function setReportClientSharing(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const parsed = z.object({ clientId: uuid, reportId: uuid, shared: z.enum(["true","false"]) })
    .safeParse({ clientId, reportId: form.get("reportId"), shared: form.get("shared") });
  if (!parsed.success) redirect(errorPath(clientId,"Invalid report sharing request."));
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager"].includes(role)) redirect(errorPath(clientId,"Report sharing access required."));
  const { error } = await retryIdempotentRequest(async () => db.rpc("set_report_client_sharing", {
    p_client_id: clientId, p_report_id: parsed.data.reportId, p_shared: parsed.data.shared === "true",
  }));
  if (error) redirect(errorPath(clientId,error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?report=${parsed.data.reportId}`);
}
