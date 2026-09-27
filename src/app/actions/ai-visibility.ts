"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { insertWithStableId, retryIdempotentRequest } from "@/lib/idempotent-insert";
import { parseTimestamp } from "@/lib/reddit";

const uuid = z.uuid();
const path = (clientId: string) => `/clients/${clientId}/ai-visibility`;
const errorPath = (clientId: string, message: string, setId?: string) =>
  `${path(clientId)}?error=${encodeURIComponent(message.slice(0, 180))}${setId ? `&set=${encodeURIComponent(setId)}` : ""}`;
const canEdit = (role: string) => ["owner", "manager", "researcher"].includes(role);

export async function createPromptSet(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const parsed = z.object({ clientId: uuid, name: z.string().trim().min(1).max(160),
    version: z.coerce.number().int().positive(), language: z.string().trim().min(2).max(40),
    region: z.string().trim().min(2).max(80), plannedRepeats: z.coerce.number().int().min(1).max(10),
  }).safeParse({ clientId, name: form.get("name"), version: form.get("version"),
    language: form.get("language"), region: form.get("region"), plannedRepeats: form.get("plannedRepeats") });
  if (!parsed.success) redirect(errorPath(clientId, "Check the prompt set details."));
  const { db, role, userId } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId, "Prompt edit access required."));
  const id = randomUUID();
  const { error } = await insertWithStableId(id,
    async () => db.from("ai_prompt_sets").insert({ id, client_id: clientId, name: parsed.data.name,
      version: parsed.data.version, language: parsed.data.language, region: parsed.data.region,
      planned_repeats: parsed.data.plannedRepeats, created_by: userId }).select("id").single(),
    async () => db.from("ai_prompt_sets").select("id").eq("id", id).eq("client_id", clientId).maybeSingle());
  if (error) redirect(errorPath(clientId, error.code === "23505" ? "That prompt set name and version already exist." : error.message));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${id}`);
}

export async function addPrompt(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  const parsed = z.object({ clientId: uuid, setId: uuid, ordinal: z.coerce.number().int().min(1).max(100),
    buyerStage: z.enum(["discovery", "comparison", "alternatives", "use_case", "reputation"]),
    branded: z.enum(["yes", "no"]), question: z.string().trim().min(1).max(2000),
  }).safeParse({ clientId, setId, ordinal: form.get("ordinal"), buyerStage: form.get("buyerStage"),
    branded: form.get("branded"), question: form.get("question") });
  if (!parsed.success) redirect(errorPath(clientId, "Check the prompt details.", setId));
  const { db, role, userId } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId, "Prompt edit access required.", setId));
  const id = randomUUID();
  const { error } = await insertWithStableId(id,
    async () => db.from("ai_prompts").insert({ id, client_id: clientId, prompt_set_id: setId,
      ordinal: parsed.data.ordinal, buyer_stage: parsed.data.buyerStage, branded: parsed.data.branded === "yes",
      question: parsed.data.question, created_by: userId }).select("id").single(),
    async () => db.from("ai_prompts").select("id").eq("id", id).eq("client_id", clientId).maybeSingle());
  if (error) redirect(errorPath(clientId, error.code === "23505" ? "That prompt number is already used in this set." : error.message, setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}#prompts`);
}

export async function freezePromptSet(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(setId).success) redirect(errorPath(clientId, "Invalid prompt set.", setId));
  const { db, role } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId, "Prompt edit access required.", setId));
  const { error } = await retryIdempotentRequest(async () => db.rpc("freeze_ai_prompt_set", { p_client_id: clientId, p_set_id: setId }));
  if (error) redirect(errorPath(clientId, error.message, setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}`);
}

export async function recordManualAnswer(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  const parsed = z.object({ clientId: uuid, setId: uuid, promptId: uuid,
    waveLabel: z.string().trim().min(1).max(80), provider: z.string().trim().min(1).max(80),
    modelLabel: z.string().trim().min(1).max(120), collectionMethod: z.enum(["manual_consumer", "manual_api_export"]),
    configNote: z.string().trim().min(1).max(500), repeatNo: z.coerce.number().int().min(1).max(10),
    observedAt: z.string().trim().min(1).max(80), outcome: z.enum(["valid", "refusal", "error"]),
    answerText: z.string().trim().max(30000), errorNote: z.string().trim().max(2000),
    sourceNote: z.string().trim().min(1).max(2000), citationText: z.string().max(42000),
  }).safeParse({ clientId, setId, promptId: form.get("promptId"), waveLabel: form.get("waveLabel"),
    provider: form.get("provider"), modelLabel: form.get("modelLabel"), collectionMethod: form.get("collectionMethod"),
    configNote: form.get("configNote"), repeatNo: form.get("repeatNo"), observedAt: form.get("observedAt"),
    outcome: form.get("outcome"), answerText: form.get("answerText") ?? "", errorNote: form.get("errorNote") ?? "",
    sourceNote: form.get("sourceNote"), citationText: form.get("citationText") ?? "" });
  if (!parsed.success) redirect(errorPath(clientId, "Check the answer details.", setId));
  if (parsed.data.outcome === "valid" ? !parsed.data.answerText : !parsed.data.errorNote) {
    redirect(errorPath(clientId, "Valid answers need text; refusals and errors need an explanation.", setId));
  }
  let observedAt: string;
  try { observedAt = parseTimestamp(parsed.data.observedAt); }
  catch { redirect(errorPath(clientId, "Include a valid observation time with timezone offset.", setId)); }
  const citationUrls = [...new Set(parsed.data.citationText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
  if (citationUrls.length > 20 || citationUrls.some((value) => {
    try { return value.length > 2000 || new URL(value).protocol !== "https:"; }
    catch { return true; }
  })) redirect(errorPath(clientId, "Use at most 20 HTTPS citation URLs, one per line.", setId));
  const { db, role } = await requireClient(clientId);
  if (!canEdit(role)) redirect(errorPath(clientId, "Answer import access required.", setId));
  const id = randomUUID();
  const { error } = await retryIdempotentRequest(async () => db.rpc("record_manual_ai_answer", {
    p_id: id, p_client_id: clientId, p_set_id: setId, p_prompt_id: parsed.data.promptId,
    p_wave_label: parsed.data.waveLabel, p_provider: parsed.data.provider, p_model_label: parsed.data.modelLabel,
    p_collection_method: parsed.data.collectionMethod, p_config_note: parsed.data.configNote,
    p_repeat_no: parsed.data.repeatNo, p_observed_at: observedAt, p_outcome: parsed.data.outcome,
    p_answer_text: parsed.data.answerText || null, p_error_note: parsed.data.errorNote || null,
    p_source_note: parsed.data.sourceNote, p_citation_urls: citationUrls,
  }));
  if (error) redirect(errorPath(clientId, error.code === "23505" ? "This prompt/repeat already has a result in that exact cohort." : error.message, setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}&run=${id}`);
}

export async function reviewManualAnswer(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const setId = String(form.get("setId") ?? "");
  const parsed = z.object({ clientId: uuid, setId: uuid, runId: uuid,
    expectedVersion: z.coerce.number().int().min(0), mention: z.enum(["yes", "no"]),
    recommendation: z.enum(["yes", "no"]), note: z.string().trim().min(1).max(2000),
  }).safeParse({ clientId, setId, runId: form.get("runId"), expectedVersion: form.get("expectedVersion"),
    mention: form.get("mention"), recommendation: form.get("recommendation"), note: form.get("note") });
  if (!parsed.success) redirect(errorPath(clientId, "Check the answer review.", setId));
  if (parsed.data.recommendation === "yes" && parsed.data.mention === "no") redirect(errorPath(clientId, "A recommendation must mention the client.", setId));
  const { db, role } = await requireClient(clientId);
  if (!["owner", "manager", "reviewer"].includes(role)) redirect(errorPath(clientId, "Review access required.", setId));
  const { error } = await retryIdempotentRequest(async () => db.rpc("review_ai_answer", {
    p_client_id: clientId, p_run_id: parsed.data.runId, p_expected_version: parsed.data.expectedVersion,
    p_mentions: parsed.data.mention === "yes", p_recommends: parsed.data.recommendation === "yes", p_note: parsed.data.note,
  }));
  if (error) redirect(errorPath(clientId, error.message, setId));
  revalidatePath(path(clientId));
  redirect(`${path(clientId)}?set=${setId}&run=${parsed.data.runId}`);
}
