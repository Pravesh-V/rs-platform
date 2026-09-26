"use server";

import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase";

export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const db = await serverDb();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=Invalid%20email%20or%20password");
  redirect("/clients");
}

export async function signOut() {
  const db = await serverDb();
  await db.auth.signOut();
  redirect("/login");
}
