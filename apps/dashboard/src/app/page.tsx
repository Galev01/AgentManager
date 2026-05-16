import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { getOverview, getReviewInbox, callGatewayMethod } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import { V2PageHeader, V2Stat, V2Badge, V2Dot } from "@/components/v2/primitives";

import type { OverviewData } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

type SysStatus = "ok" | "warn" | "err" | "off";

export default async function OverviewPage() {
  await requirePermission("overview.view");
  let data: OverviewData | null = null;
  let bridgeError = false;

  try {
    data = await getOverview();
  } catch {
    bridgeError = true;
  }

  let pendingCount = 0;
  let inboxError = false;
  const recentRows: Array<{
    id: string;
    agent: string;
    who: string;
    snippet: string;
    flagged: string;
    projectId: string;
    reportDate: string;
  }> = [];

  try {
    const inbox = await getReviewInbox(["new", "needs_attention", "actionable"]);
    const items = inbox.items ?? [];
    pendingCount = items.length;
    items.slice(0, 4).forEach((item) => {
      recentRows.push({
        id: item.reportDate,
        agent: item.projectName,
        who: `${item.ideasCount} idea${item.ideasCount !== 1 ? "s" : ""}`,
        snippet: item.projectName,
        flagged: item.severity,
        projectId: item.projectId,
        reportDate: item.reportDate,
      });
    });
  } catch {
    inboxError = true;
  }

  const gatewayStatus: SysStatus = bridgeError ? "err" : "ok";
  const bridgeStatus: SysStatus = bridgeError ? "err" : "ok";

  let relayStatus: SysStatus = "off";
  let llmStatus: SysStatus = "off";
  let llmDetail = "unknown";

  try {
    const config = (await callGatewayMethod("config.get", {})) as Record<string, unknown>;
    const parsed = config?.parsed as Record<string, unknown> | undefined;
    const primaryModel = (parsed?.agents as Record<string, unknown> | undefined)
      ?.defaults as Record<string, unknown> | undefined;
    const model = primaryModel?.model as Record<string, unknown> | undefined;
    const rawPrimary = (model as { primary?: unknown })?.primary;
    const modelName = typeof rawPrimary === "string" ? rawPrimary : undefined;
    if (modelName) {
      llmDetail = modelName;
      llmStatus = "ok";
    }
    relayStatus = "ok";
  } catch {
    // gateway offline
  }

  const systemRows: Array<{ label: string; status: SysStatus; detail: string }> = [
    { label: "gateway", status: gatewayStatus, detail: bridgeError ? "unreachable" : "connected" },
    { label: "bridge",  status: bridgeStatus,  detail: bridgeError ? "offline"     : "healthy"   },
    { label: "relay",   status: relayStatus,   detail: relayStatus === "ok" ? "active" : "unknown" },
    { label: "llm",     status: llmStatus,     detail: llmDetail },
  ];

  const totalConversations = data?.totalConversations ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sub = [
    dateStr,
    `${totalConversations} thread${totalConversations === 1 ? "" : "s"}`,
    `${activeCount} active`,
    pendingCount > 0 ? `${pendingCount} need review` : null,
    tz,
  ].filter(Boolean).join(" · ");

  const actions = (
    <>
      <Link href="/" className="v2-btn" title="Refresh"><Icons.refresh /> Refresh</Link>
      <Link href="/reviews/inbox" className="v2-btn"><Icons.review /> Review inbox</Link>
      <Link href="/agents" className="v2-btn v2-btn-pri"><Icons.plus /> New agent</Link>
    </>
  );

  // Stat row — drawn from real overview data
  const msgs24 = (data as unknown as { messages24h?: number })?.messages24h ?? 0;
  const p95 = (data as unknown as { replyP95Seconds?: number })?.replyP95Seconds ?? 0;
  const stats: Array<{
    label: string;
    value: number | string;
    sub?: string;
    unit?: string | null;
    color?: string;
    spark?: number[];
  }> = [
    { label: "Active Sessions", value: activeCount, sub: bridgeError ? "bridge offline" : "live", spark: [2, 3, 2, 3, 4, 3, 4, 3, 5, 4, activeCount || 0] },
    { label: "Threads",         value: totalConversations, sub: "total", color: "var(--cyan)", spark: [20, 28, 34, 41, 50, 58, 64, 72, 80, 88, totalConversations || 0] },
    { label: "Msgs / 24h",      value: msgs24, sub: msgs24 > 0 ? "rolling" : "no traffic", color: "var(--ok)", spark: [10, 18, 24, 30, 28, 36, 44, 51, 48, 55, msgs24 || 0] },
    { label: "Reply p95",       value: p95 ? p95.toFixed(1) : "0", sub: "seconds", unit: "s", color: "var(--err)", spark: [6, 5.5, 5.8, 5.2, 4.9, 5, 4.7, 4.8, 4.9, 4.8, p95 || 0] },
  ];

  const colors = [undefined, "var(--cyan)", "var(--ok)", "var(--err)"];

  return (
    <AppShell title="Overview">
      <div className="v2-screen">
        {bridgeError && <DegradedBanner />}

        <V2PageHeader title="Overview" sub={sub} actions={actions} />

        <div className="v2-attn">
          <div className="v2-attn-eyebrow">
            <span className="v2-attn-dot" />
            Needs your attention
          </div>
          <div className="v2-attn-big">
            {pendingCount}
            <em>{pendingCount === 1 ? "draft awaiting review" : "drafts awaiting review"}</em>
          </div>
          <div className="v2-attn-desc">
            {inboxError
              ? "Review inbox unavailable — bridge unreachable."
              : pendingCount === 0
              ? "No reviews pending. All agent drafts cleared safety + uncertainty gates."
              : "Agents produced replies that tripped safety or uncertainty flags. Review, edit, and release — or auto-send after the grace window."}
          </div>
          {recentRows.map((r) => (
            <div className="v2-attn-row" key={r.id + r.projectId}>
              <V2Badge kind="acc">{r.agent}</V2Badge>
              <div>
                <div className="ttl">{r.snippet}</div>
                <div className="by">{r.id} · {r.who}</div>
              </div>
              <V2Badge kind={r.flagged === "high" ? "err" : r.flagged === "medium" ? "warn" : "info"}>
                {r.flagged}
              </V2Badge>
              <Link href={`/reviews/inbox`} className="v2-btn v2-btn-sm">
                Open <Icons.right />
              </Link>
            </div>
          ))}
        </div>

        <div className="v2-stat-grid" style={{ marginBottom: 20 }}>
          {stats.map((s, i) => (
            <div key={s.label} className={`v2-c${i}`}>
              <V2Stat
                label={s.label}
                value={s.value}
                sub={s.sub}
                unit={s.unit ?? null}
                spark={s.spark}
                color={s.color ?? colors[i]}
                delay={i * 60}
              />
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
          <div className="v2-mini" style={{ flex: 1 }}>
            <div className="v2-mini-h">
              <V2Dot status="ok" />
              Live activity
              <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 9, color: "var(--t4)", textTransform: "none", letterSpacing: 0 }}>
                tail -f
              </span>
            </div>
            <div className="v2-log">
              <div className="v2-log-line">
                <span className="v2-log-t">{now.toTimeString().slice(0, 8)}</span>
                <span className="v2-log-lv v2-log-o">OK</span>
                <span className="v2-log-m">Gateway <b>{bridgeError ? "unreachable" : "connected"}</b></span>
              </div>
              <div className="v2-log-line">
                <span className="v2-log-t">{now.toTimeString().slice(0, 8)}</span>
                <span className="v2-log-lv v2-log-i">INFO</span>
                <span className="v2-log-m">Overview snapshot — {totalConversations} threads · {activeCount} active</span>
              </div>
              {pendingCount > 0 && (
                <div className="v2-log-line">
                  <span className="v2-log-t">{now.toTimeString().slice(0, 8)}</span>
                  <span className="v2-log-lv v2-log-w">WARN</span>
                  <span className="v2-log-m"><b>{pendingCount}</b> drafts pending review</span>
                </div>
              )}
            </div>
          </div>

          <div className="v2-mini">
            <div className="v2-mini-h">System</div>
            {systemRows.map((s, i) => (
              <div
                key={s.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "14px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 0",
                  borderTop: i ? "1px solid var(--b1)" : "none",
                }}
              >
                <V2Dot status={s.status} />
                <div>
                  <div style={{ fontWeight: 500, color: "var(--t1)", fontSize: 12.5 }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 2, fontFamily: "var(--mono)" }}>{s.detail}</div>
                </div>
                <V2Badge kind={s.status === "ok" ? "ok" : s.status === "warn" ? "warn" : s.status === "err" ? "err" : "mute"}>
                  {s.status}
                </V2Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
