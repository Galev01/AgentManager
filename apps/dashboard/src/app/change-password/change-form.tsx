"use client";
import { useState } from "react";

export function ChangeForm() {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg(""); setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    setLoading(false);
    if (res.ok) { setMsg("Password updated."); setOld(""); setNew(""); return; }
    const body = await res.json().catch(() => ({}));
    setMsg(body?.error || "Failed");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        type="password"
        placeholder="Current password"
        value={oldPassword}
        onChange={(e) => setOld(e.target.value)}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        required
      />
      <input
        type="password"
        placeholder="New password (&ge; 8 chars)"
        value={newPassword}
        minLength={8}
        onChange={(e) => setNew(e.target.value)}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        required
      />
      {msg && <p className="text-sm text-text-muted">{msg}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-pill bg-primary py-3 px-6 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
