"use server";

import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase";

export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  let failure: "credentials" | "service" | null = null;
  try {
    const db = await serverDb();
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) failure = error.code === "invalid_credentials" ? "credentials" : "service";
  } catch {
    failure = "service";
  }
  if (failure) redirect(`/login?error=${failure}`);
  redirect("/clients");
}

export async function signOut() {
  const db = await serverDb();
  await db.auth.signOut();
  redirect("/login");
}
