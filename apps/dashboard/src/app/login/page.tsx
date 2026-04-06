"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setError("Invalid password"); return; }
      router.push("/");
      router.refresh();
    } catch { setError("Connection failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-sm">
        <div className="h-1 rounded-t bg-gradient-to-r from-primary to-[#AA6CC0]" />
        <div className="rounded-b bg-dark-card p-8 shadow-card-dark">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text-primary">OpenClaw Manager</h1>
          <p className="mb-8 text-sm text-text-muted">Sign in to manage your WhatsApp bot</p>
          <form onSubmit={handleSubmit}>
            <label className="mb-2 block text-sm text-text-gray" htmlFor="password">Admin Password</label>
            <input
              id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
              placeholder="Enter password" autoFocus
            />
            {error && <p className="mb-4 text-sm text-danger">{error}</p>}
            <button type="submit" disabled={loading || !password}
              className="w-full rounded-pill bg-primary py-3 px-6 font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in...
                </span>
              ) : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
