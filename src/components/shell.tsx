import Link from "next/link";
import { signOut } from "@/app/actions/auth";

export function Shell({ children, clientId, clientName }: { children: React.ReactNode; clientId?: string; clientName?: string }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link href="/clients" className="brand"><span className="brand-mark">R</span><span>ReddSphere</span></Link>
        <form action={signOut} className="mobile-signout"><button type="submit">Sign out</button></form>
      </div>
      <div className="sidebar-group">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <Link href="/clients">Agency overview</Link>
        {clientId && <>
          <div className="sidebar-group">{clientName?.toUpperCase()}</div>
          <Link href={`/clients/${clientId}`}>Overview &amp; evidence</Link>
          <Link href={`/clients/${clientId}/research`}>Research &amp; opportunities</Link>
          <Link href={`/clients/${clientId}/content`}>Drafts &amp; review</Link>
          <Link href={`/clients/${clientId}/imports`}>Import Reddit data</Link>
        </>}
      </nav>
      <div className="sidebar-bottom"><div className="status"><span className="status-dot" /> Manual evidence mode</div><form action={signOut}><button type="submit" className="text-button">Sign out</button></form></div>
    </aside>
    <div className="app-main"><header className="topbar"><span>ReddSphere <span className="muted">/</span> {clientName ?? "Agency"}</span><span className="topbar-note">Private workspace</span></header><main className="content">{children}</main></div>
  </div>;
}
