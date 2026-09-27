"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { insertWithStableId, retryIdempotentRequest } from "@/lib/idempotent-insert";
import { parseTimestamp } from "@/lib/reddit";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/search-visibility`;
const errorPath = (clientId: string, message: string, setId?: string) =>
  `${path(clientId)}?error=${encodeURIComponent(message.slice(0,180))}${setId ? `&set=${encodeURIComponent(setId)}` : ""}`;
const canEdit = (role: string) => ["owner","manager","researcher"].includes(role);

export async function createSearchSet(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const parsed = z.object({ clientId: uuid, name: z.string().trim().min(1).max(160),
    version: z.coerce.number().int().positive(), engine: z.string().trim().min(1).max(80),
    region: z.string().trim().min(2).max(80), language: z.string().trim().min(2).max(40),
    device: z.enum(["desktop","mobile"]),
  }).safeParse({ clientId, name: form.get("name"), version: form.get("version"),
    engine: form.get("engine"), region: form.get("region"), language: form.get("language"), device: form.get("device") });
  if (!parsed.success) redirect(errorPath(clientId,"Check the keyword set details."));
  const { db, role, userId } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId,"Keyword edit access required."));
  const id = randomUUID();
  const { error } = await insertWithStableId(id,
    async () => db.from("search_sets").insert({ id, client_id: clientId, name: parsed.data.name,
      version: parsed.data.version, engine: parsed.data.engine, region: parsed.data.region,
      language: parsed.data.language, device: parsed.data.device, created_by: userId }).select("id").single(),
    async () => db.from("search_sets").select("id").eq("id",id).eq("client_id",clientId).maybeSingle());
  if (error) redirect(errorPath(clientId,error.code==="23505" ? "That set name and version already exist." : error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${id}`);
}

export async function addSearchKeyword(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  const parsed = z.object({ clientId: uuid, setId: uuid, ordinal: z.coerce.number().int().min(1).max(100),
    phrase: z.string().trim().min(1).max(300),
  }).safeParse({ clientId, setId, ordinal: form.get("ordinal"), phrase: form.get("phrase") });
  if (!parsed.success) redirect(errorPath(clientId,"Check the keyword details.",setId));
  const { db, role, userId } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId,"Keyword edit access required.",setId));
  const id = randomUUID();
  const { error } = await insertWithStableId(id,
    async () => db.from("search_keywords").insert({ id, client_id: clientId, set_id: setId,
      ordinal: parsed.data.ordinal, phrase: parsed.data.phrase, created_by: userId }).select("id").single(),
    async () => db.from("search_keywords").select("id").eq("id",id).eq("client_id",clientId).maybeSingle());
  if (error) redirect(errorPath(clientId,error.code==="23505" ? "That keyword number is already used." : error.message,setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}`);
}

export async function freezeSearchSet(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(setId).success) redirect(errorPath(clientId,"Invalid set.",setId));
  const { db, role } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId,"Keyword edit access required.",setId));
  const { error } = await retryIdempotentRequest(async () => db.rpc("freeze_search_set",{p_client_id:clientId,p_set_id:setId}));
  if (error) redirect(errorPath(clientId,error.message,setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}`);
}

export async function addSearchObservation(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  const parsed = z.object({ clientId: uuid, setId: uuid, keywordId: uuid,
    waveLabel: z.string().trim().min(1).max(80), observedAt: z.string().trim().min(1).max(80),
    sourceProvider: z.string().trim().min(1).max(120), samplingMethod: z.enum(["manual_serp","authorized_export"]),
    resultType: z.enum(["organic","ai_summary","advertisement"]), outcome: z.enum(["present","not_found","error"]),
    rankText: z.string().trim().max(3), rankingUrl: z.string().trim().max(2000),
    resultTitle: z.string().trim().max(500), detail: z.string().trim().max(2000),
    sourceNote: z.string().trim().min(1).max(2000),
  }).safeParse({ clientId, setId, keywordId: form.get("keywordId"), waveLabel: form.get("waveLabel"),
    observedAt: form.get("observedAt"), sourceProvider: form.get("sourceProvider"),
    samplingMethod: form.get("samplingMethod"), resultType: form.get("resultType"), outcome: form.get("outcome"),
    rankText: form.get("rank") ?? "", rankingUrl: form.get("rankingUrl") ?? "",
    resultTitle: form.get("resultTitle") ?? "", detail: form.get("detail") ?? "", sourceNote: form.get("sourceNote") });
  if (!parsed.success) redirect(errorPath(clientId,"Check the search observation.",setId));
  const rank = parsed.data.rankText ? Number(parsed.data.rankText) : null;
  if (rank!==null && (!Number.isInteger(rank) || rank<1 || rank>100)) redirect(errorPath(clientId,"Rank must be 1–100.",setId));
  const hasUrl = Boolean(parsed.data.rankingUrl);
  if (hasUrl) {
    try { if (new URL(parsed.data.rankingUrl).protocol!=="https:") throw new Error("HTTPS required"); }
    catch { redirect(errorPath(clientId,"Use an HTTPS ranking URL.",setId)); }
  }
  const { outcome, resultType } = parsed.data;
  if ((outcome==="present" && resultType==="organic" && (rank===null || !hasUrl))
    || (outcome==="present" && resultType==="advertisement" && !hasUrl)
    || (outcome==="present" && resultType==="ai_summary" && rank!==null)
    || (outcome!=="present" && (rank!==null || hasUrl || !parsed.data.detail))) {
    redirect(errorPath(clientId,"Check rank, URL and detail for this outcome and result type.",setId));
  }
  let observedAt: string;
  try { observedAt=parseTimestamp(parsed.data.observedAt); }
  catch { redirect(errorPath(clientId,"Include a valid observation time with timezone offset.",setId)); }
  const { db, role, userId } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId,"Search observation access required.",setId));
  const id = randomUUID();
  const { error } = await insertWithStableId(id,
    async () => db.from("search_observations").insert({ id, client_id: clientId, set_id: setId,
      keyword_id: parsed.data.keywordId, wave_label: parsed.data.waveLabel, observed_at: observedAt,
      source_provider: parsed.data.sourceProvider, sampling_method: parsed.data.samplingMethod,
      result_type: resultType, outcome, rank, ranking_url: parsed.data.rankingUrl || null,
      result_title: parsed.data.resultTitle || null, detail: parsed.data.detail || null,
      source_note: parsed.data.sourceNote, created_by: userId }).select("id").single(),
    async () => db.from("search_observations").select("id").eq("id",id).eq("client_id",clientId).maybeSingle());
  if (error) redirect(errorPath(clientId,error.message,setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}&observation=${id}`);
}
