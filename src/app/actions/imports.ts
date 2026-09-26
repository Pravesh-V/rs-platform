"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { previewCsv } from "@/lib/imports";

export async function commitImport(clientId: string, csv: string, fileName: string, sourceNote: string, idempotencyKey: string) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new Error("Invalid request identifier.");
    if (fileName.length > 200 || !sourceNote.trim() || sourceNote.length > 1000) throw new Error("Add a source note and valid file name.");
    const preview = previewCsv(csv);
    if (preview.errors.length) throw new Error("Resolve all row errors before importing.");
    if (!preview.rows.length) throw new Error("The file has no data rows.");
    const { db, role } = await requireClient(clientId);
    if (!["owner","manager","researcher"].includes(role)) throw new Error("Import access required.");
    const { data, error } = await db.rpc("commit_reddit_import", {
      p_client_id: clientId, p_idempotency_key: idempotencyKey, p_file_name: fileName, p_source_note: sourceNote, p_rows: preview.rows,
    });
    if (error || !data) throw new Error(error?.message ?? "Import failed.");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/imports`);
    return { ok: true as const, batchId: data as string, count: preview.rows.length };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Import failed." };
  }
}
