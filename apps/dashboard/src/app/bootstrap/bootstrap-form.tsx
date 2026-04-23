"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BootstrapForm() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "Bootstrap failed");
        return;
      }
      router.push("/");
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit}>
      <label className="mb-2 block text-sm text-text-gray">Bootstrap token</label>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        required
      />
      <label className="mb-2 block text-sm text-text-gray">Admin username</label>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        required
      />
      <label className="mb-2 block text-sm text-text-gray">Admin password (&ge; 8 chars)</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        required
      />
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-pill bg-primary py-3 px-6 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create admin & sign in"}
      </button>
    </form>
  );
}
