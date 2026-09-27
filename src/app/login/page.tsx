import { redirect } from "next/navigation";
import { signIn } from "@/app/actions/auth";
import { configured, serverDb } from "@/lib/supabase";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (configured()) {
    const db = await serverDb();
    const { data } = await db.auth.getClaims();
    if (data?.claims?.sub) redirect("/clients");
  }
  const { error } = await searchParams;
  const errorMessage = error === "credentials" ? "Invalid email or password" : error === "service" ? "Sign-in service is unavailable. Try again in a moment." : null;
  return <main className="auth-shell">
    <div className="auth-card">
      <div className="brand"><span className="brand-mark">R</span><span>ReddSphere</span></div>
      <div className="eyebrow">PRIVATE AGENCY WORKSPACE</div>
      <h1>Sign in</h1>
      <p className="muted">Work with client research, contributions, and evidence in one place.</p>
      {!configured() ? <div className="notice warning"><strong>Setup needed</strong><p>Add the Supabase URL and publishable key from your development project to <code>.env.local</code>, then apply the migration. See the README.</p></div> : <form action={signIn} className="stack">
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
        {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
        <button className="button primary" type="submit">Sign in</button>
      </form>}
      <p className="fine-print">Access is invitation only. Contact the workspace owner for an account.</p>
    </div>
  </main>;
}
