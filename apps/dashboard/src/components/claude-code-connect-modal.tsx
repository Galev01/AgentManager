"use client";
import { useEffect, useState } from "react";
import type { ClaudeCodeConnectConfig } from "@openclaw-manager/types";

export function ClaudeCodeConnectModalBody() {
  const [config, setConfig] = useState<ClaudeCodeConnectConfig | null>(null);
  const [tab, setTab] = useState<"antigravity" | "vscode" | "cli">("antigravity");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/claude-code/connect-config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  if (!config) {
    return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>;
  }

  const snippet = config[tab];

  function copy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        Paste this into your IDE&apos;s MCP configuration. Replace{" "}
        <code>&lt;absolute path to mcp-openclaw&gt;</code> with the path to this repo&apos;s{" "}
        <code>packages/mcp-openclaw/dist/server.js</code>.
      </p>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {(["antigravity", "vscode", "cli"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`tab ${tab === k ? "on" : ""}`}
            onClick={() => setTab(k)}
          >
            {k}
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <pre className="codeblock">{snippet}</pre>
        <button type="button" className="codeblock-copy" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
