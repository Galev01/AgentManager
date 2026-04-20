"use client";
import { useEffect, useState } from "react";
import type { ClaudeCodeConnectConfig } from "@openclaw-manager/types";

export function ClaudeCodeConnectModalBody() {
  const [config, setConfig] = useState<ClaudeCodeConnectConfig | null>(null);
  const [tab, setTab] = useState<"antigravity" | "vscode" | "cli">("antigravity");

  useEffect(() => {
    fetch("/api/claude-code/connect-config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  if (!config) return <div className="text-sm text-text-muted">Loading…</div>;

  const snippet = config[tab];

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Connect a new IDE</h2>
      <p className="mb-4 text-sm text-text-muted">
        Paste this into your IDE's MCP configuration. Replace <code>&lt;absolute path to mcp-openclaw&gt;</code> with the path
        to this repo's <code>packages/mcp-openclaw/dist/server.js</code>.
      </p>
      <div className="mb-3 flex gap-2">
        {(["antigravity", "vscode", "cli"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded px-3 py-1.5 text-xs ${tab === k ? "bg-primary text-white" : "bg-dark-lighter text-text-muted"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="max-h-[40vh] overflow-auto rounded bg-dark-lighter p-4 text-xs whitespace-pre-wrap">
          {snippet}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(snippet)}
          className="absolute right-2 top-2 rounded bg-primary px-2 py-1 text-xs text-white"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
