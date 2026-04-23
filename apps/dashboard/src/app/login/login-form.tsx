"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({
  oidcEnabled, oidcDisplayName, redirect, oidcUnlinked,
  unlinkedIssuer, unlinkedSub, unlinkedEmail,
}: {
  oidcEnabled: boolean;
  oidcDisplayName?: string;
  redirect?: string;
  oidcUnlinked?: boolean;
  unlinkedIssuer?: string;
  unlinkedSub?: string;
  unlinkedEmail?: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "bootstrap_required") {
          router.push("/bootstrap" + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""));
          return;
        }
        setError("Invalid credentials");
        return;
      }
      if (!res.ok) { setError("Login failed"); return; }

      // If we arrived here from an unlinked OIDC callback, stash the claim
      // in sessionStorage so /link-identity (P5) can complete the link.
      if (oidcUnlinked && unlinkedIssuer && unlinkedSub) {
        try {
          sessionStorage.setItem(
            "ocm_pending_link",
            JSON.stringify({ issuer: unlinkedIssuer, sub: unlinkedSub, email: unlinkedEmail }),
          );
          router.push("/link-identity");
          return;
        } catch {
          // fall through to normal redirect
        }
      }
      router.push(redirect || "/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function loginOidc(): Promise<void> {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/oidc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: redirect }),
      });
      if (!res.ok) { setError("OIDC unavailable"); return; }
      const { authorizationUrl } = (await res.json()) as { authorizationUrl: string };
      window.location.href = authorizationUrl;
    } catch {
      setError("OIDC unavailable");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {oidcUnlinked && (
        <div className="mb-4 rounded border border-warn-dim bg-warn-dim/40 p-3 text-sm text-warn">
          Your external identity is not linked to any local user. Sign in locally first, then confirm the link.
        </div>
      )}
      <label className="mb-2 block text-sm text-text-gray" htmlFor="username">Username</label>
      <input
        id="username"
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
        autoFocus
        autoComplete="username"
      />
      <label className="mb-2 block text-sm text-text-gray" htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
        autoComplete="current-password"
      />
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading || !username || !password}
        className="w-full rounded-pill bg-primary py-3 px-6 font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
      {oidcEnabled && (
        <>
          <div className="my-4 text-center text-xs text-text-muted">or</div>
          <button
            type="button"
            onClick={loginOidc}
            disabled={loading}
            className="w-full rounded-pill border border-dark-border bg-dark-card py-3 px-6 font-medium text-text-primary transition disabled:opacity-50"
          >
            Sign in with {oidcDisplayName || "SSO"}
          </button>
        </>
      )}
    </form>
  );
}
