"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function LinkForm() {
  const router = useRouter();
  const [claim, setClaim] = useState<{ issuer: string; sub: string; email?: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ocm_pending_link");
      if (raw) setClaim(JSON.parse(raw));
    } catch {}
  }, []);

  async function link(): Promise<void> {
    if (!claim) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/auth/link-oidc/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerKey: "default", ...claim }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json()).error || "failed");
      return;
    }
    try { sessionStorage.removeItem("ocm_pending_link"); } catch {}
    router.push("/");
  }

  if (!claim) {
    return (
      <p className="text-sm text-text-muted">
        No pending identity to link. Return to <a href="/" className="text-primary">overview</a>.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <p>
        You signed in with an external identity that is not yet linked to your account. Confirm to link it
        now:
      </p>
      <dl className="rounded border border-dark-border p-3">
        <dt className="text-xs text-text-muted">Issuer</dt>
        <dd className="mono">{claim.issuer}</dd>
        <dt className="text-xs text-text-muted">Subject</dt>
        <dd className="mono">{claim.sub}</dd>
        {claim.email && (
          <>
            <dt className="text-xs text-text-muted">Email</dt>
            <dd>{claim.email}</dd>
          </>
        )}
      </dl>
      {err && <p className="text-sm text-danger">{err}</p>}
      <button
        onClick={link}
        disabled={busy}
        className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50"
      >
        {busy ? "Linking..." : "Link identity"}
      </button>
    </div>
  );
}
