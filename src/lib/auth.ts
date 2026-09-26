import { redirect } from "next/navigation";
import { configured, serverDb } from "@/lib/supabase";

export async function requireUser() {
  if (!configured()) redirect("/login");
  const db = await serverDb();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  return { db, userId: data.claims.sub };
}

export async function requireClient(clientId: string) {
  const { db, userId } = await requireUser();
  const { data: client, error } = await db.from("clients").select("id,organization_id,name,website,timezone,created_at").eq("id", clientId).maybeSingle();
  if (error || !client) redirect("/clients");
  const { data: membership } = await db.from("memberships").select("role").eq("organization_id", client.organization_id).eq("user_id", userId).maybeSingle();
  const { data: access } = await db.from("client_access").select("role").eq("client_id", clientId).eq("user_id", userId).maybeSingle();
  return { db, client, role: membership?.role === "owner" ? "owner" : access?.role ?? "none" };
}
