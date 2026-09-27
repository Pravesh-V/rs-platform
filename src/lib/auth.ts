import { redirect } from "next/navigation";
import { isConnectionFailure, retryIdempotentRequest } from "@/lib/idempotent-insert";
import { configured, serverDb } from "@/lib/supabase";

export async function requireUser() {
  if (!configured()) redirect("/login");
  const db = await serverDb();
  const { data, error } = await retryIdempotentRequest(() => db.auth.getClaims());
  if (isConnectionFailure(error)) redirect("/login?error=service");
  if (error || !data?.claims?.sub) redirect("/login");
  return { db, userId: data.claims.sub };
}

export async function requireClient(clientId: string) {
  const { db, userId } = await requireUser();
  const { data: client, error } = await retryIdempotentRequest(async () => db.from("clients").select("id,organization_id,name,website,timezone,created_at").eq("id", clientId).maybeSingle());
  if (error) throw new Error(`Could not load client: ${error.message}`);
  if (!client) redirect("/clients");
  const { data: membership, error: membershipError } = await retryIdempotentRequest(async () => db.from("memberships").select("role").eq("organization_id", client.organization_id).eq("user_id", userId).maybeSingle());
  const { data: access, error: accessError } = await retryIdempotentRequest(async () => db.from("client_access").select("role").eq("client_id", clientId).eq("user_id", userId).maybeSingle());
  if (membershipError || accessError) throw new Error("Could not verify client access. Please refresh this page.");
  return { db, client, userId, role: membership?.role === "owner" ? "owner" : access?.role ?? "none" };
}
