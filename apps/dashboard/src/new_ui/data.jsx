/* Mock data for OpenClaw Manager */

window.DATA = {
  gateway: { status: "ok",   label: "Gateway",   detail: "127.0.0.1:7321 · 38ms" },
  bridge:  { status: "ok",   label: "Bridge",    detail: "whatsapp · 2 sessions" },
  relay:   { status: "warn", label: "YT Relay",  detail: "rate-limit backoff" },
  llm:     { status: "ok",   label: "LLM",       detail: "claude-sonnet-4.5" },

  overview: {
    reviewInbox: 4,
    pendingReviews: [
      { id: "rv_01JH8F…", agent: "Concierge",    who: "+1 415 ••• 7782", snippet: "send me the new pricing doc when you get a sec", flagged: "PII · pricing" },
      { id: "rv_01JH8G…", agent: "Support Hub",  who: "Dario (Patreon)",  snippet: "is the v2 webhook actually stable yet or…",  flagged: "uncertain" },
      { id: "rv_01JH8H…", agent: "Concierge",    who: "+49 170 ••• 4419", snippet: "can you book a 30min with karan next tuesday",  flagged: "calendar action" },
      { id: "rv_01JH8J…", agent: "YT Mod",       who: "youtube:@kz-live", snippet: "mod this user? theyre spamming the live chat", flagged: "moderation" }
    ],
    stats: [
      { label: "Active Sessions", value: "2",    sub: "+1 since yesterday",  spark: [3,3,2,2,3,2,2,1,2,2,2] },
      { label: "Msgs / 24h",      value: "1,284",sub: "+18.2% vs yesterday", spark: [20,34,44,51,30,48,66,71,58,63,80] },
      { label: "Reply p95",       value: "4.8",  unit: "s", sub: "-0.4s", spark: [6,5.5,5.8,5.2,4.9,5,4.7,4.8,4.9,4.8,4.8] },
      { label: "Agent Uptime",    value: "99.6", unit: "%", sub: "7d · 1 incident", spark: [100,100,99,100,100,98,100,100,100,100,100] }
    ],
    activity: [
      { time: "14:42:03", lvl: "i", msg: "agent=<b>concierge</b> received message from <b>+14155551234</b>" },
      { time: "14:42:03", lvl: "o", msg: "router matched rule <b>inbound.dm</b> → agent=concierge" },
      { time: "14:42:04", lvl: "i", msg: "tool call <b>brain.lookup</b>(phone=…7782) hit=1" },
      { time: "14:42:05", lvl: "o", msg: "llm primary=<b>sonnet-4.5</b> tokens=in 412 out 98 lat=1.2s" },
      { time: "14:42:06", lvl: "o", msg: "reply sent <b>wamid.HBgN…0A</b> delivered ✓" },
      { time: "14:42:12", lvl: "w", msg: "yt-relay: <b>quotaExceeded</b> backing off 30s" },
      { time: "14:42:18", lvl: "i", msg: "cron <b>nightly.brain-compact</b> scheduled @ 02:00" },
      { time: "14:42:21", lvl: "o", msg: "session=<b>wa.kz.main</b> heartbeat ok (38ms)" },
      { time: "14:42:27", lvl: "i", msg: "review <b>rv_01JH8G</b> created (uncertain · support_hub)" }
    ]
  },

  conversations: [
    { id: "c1", name: "Maya Rhen",         phone: "+1 415 ••• 7782", lastAt: "now",    snippet: "send me the new pricing doc when you get a sec",
      color: "oklch(0.68 0.14 20)",  avatar: "MR", unread: 2,  agent: "concierge", status: "awaiting_review", selected: true },
    { id: "c2", name: "Dario (Patreon)",   phone: "+44 7911 ••• 229", lastAt: "2m",    snippet: "is the v2 webhook actually stable yet or…",
      color: "oklch(0.72 0.14 150)", avatar: "DP", unread: 1,  agent: "support_hub" },
    { id: "c3", name: "Jonas Eber",        phone: "+49 170 ••• 4419", lastAt: "6m",    snippet: "can you book a 30min with karan next tuesday",
      color: "oklch(0.65 0.15 280)", avatar: "JE", unread: 0,  agent: "concierge" },
    { id: "c4", name: "@kz-live (YT)",     phone: "youtube superchat",  lastAt: "11m",    snippet: "mod this user? theyre spamming the live chat",
      color: "oklch(0.66 0.18 30)",  avatar: "YT", unread: 0,  agent: "yt_mod" },
    { id: "c5", name: "Karan (self)",      phone: "+1 628 ••• 0041",   lastAt: "34m",    snippet: "remind me to push the deployment at 6",
      color: "oklch(0.70 0.12 240)", avatar: "KV", unread: 0,  agent: "concierge" },
    { id: "c6", name: "Elena Vasquez",     phone: "+34 612 ••• 5580",  lastAt: "1h",     snippet: "ok that worked, thanks — one more q",
      color: "oklch(0.72 0.15 85)",  avatar: "EV", unread: 0,  agent: "support_hub" },
    { id: "c7", name: "Noah Liang",        phone: "+65 9123 ••• 004",  lastAt: "2h",     snippet: "circle back tomorrow?",
      color: "oklch(0.68 0.14 200)", avatar: "NL", unread: 0,  agent: "concierge" },
    { id: "c8", name: "Priya Sundaram",    phone: "+91 98450 ••• 18",  lastAt: "3h",     snippet: "audio note received (0:42)",
      color: "oklch(0.66 0.16 340)", avatar: "PS", unread: 0,  agent: "support_hub" },
    { id: "c9", name: "+1 917 ••• 2210",   phone: "unknown",           lastAt: "5h",     snippet: "hey is this still the number?",
      color: "oklch(0.58 0.04 60)",  avatar: "?",  unread: 0,  agent: "concierge" },
    { id: "c10", name: "Team Engineering", phone: "group · 11",        lastAt: "8h",     snippet: "kat: deploying v0.44 at 18:00 UTC",
      color: "oklch(0.70 0.12 150)", avatar: "EG", unread: 0,  agent: "concierge" },
  ],

  activeThread: {
    name: "Maya Rhen",
    avatar: "MR",
    color: "oklch(0.68 0.14 20)",
    phone: "+1 415 ••• 7782",
    session: "wa.kz.main",
    brainId: "people_01H8X2…",
    tags: ["customer", "priority", "us-west"],
    messages: [
      { kind: "sys",  text: "Thread opened · routed to agent <b>concierge</b>" },
      { kind: "them", text: "hey! quick q — did the invoice for march go out?", t: "14:38" },
      { kind: "us",   text: "Hey Maya — yep, invoice #INV-0381 went out Mar 28 to maya@rhen.co. Want me to resend the PDF here?", t: "14:38", by: "concierge", lat: "1.2s" },
      { kind: "them", text: "yes please 🙏", t: "14:39" },
      { kind: "us",   text: "Sent. Also noticed your plan renews in 6 days — happy to lock in the annual rate (17% off) if you're game.", t: "14:39", by: "concierge", lat: "0.9s" },
      { kind: "them", text: "oh nice, lemme think. also send me the new pricing doc when you get a sec", t: "14:42" },
    ],
    thinking: "Drafting reply… (waiting on review — PII flag)",
    pendingReview: {
      draft: "Here's the updated pricing sheet — v0.6 went live last week: https://kz.co/pricing. Happy to walk you through the enterprise tier if you want to hop on a call.",
      flags: ["links external URL", "references unreleased tier"]
    }
  },

  sessions: [
    { id: "wa.kz.main",     kind: "whatsapp", status: "ok",   phone: "+1 415 224 7781", device: "MacBook M2 · Home", agent: "concierge",   uptime: "99.8", heartbeat: "38ms",  msgs24: 842, started: "4d 11h ago" },
    { id: "wa.kz.support",  kind: "whatsapp", status: "ok",   phone: "+1 415 224 8892", device: "VPS · fra1",        agent: "support_hub", uptime: "99.4", heartbeat: "62ms",  msgs24: 312, started: "11d 2h ago" },
    { id: "yt.relay.live",  kind: "youtube",  status: "warn", phone: "@karan-live",     device: "VPS · fra1",        agent: "yt_mod",      uptime: "96.2", heartbeat: "—",    msgs24: 104, started: "6h 14m ago" },
    { id: "wa.kz.archive",  kind: "whatsapp", status: "off",  phone: "+1 628 224 0990", device: "Raspberry Pi 5",    agent: "—",           uptime: "—",    heartbeat: "—",    msgs24: 0,   started: "stopped 2d ago" },
    { id: "yt.relay.shorts",kind: "youtube",  status: "err",  phone: "@karan-shorts",   device: "VPS · fra1",        agent: "yt_mod",      uptime: "82.1", heartbeat: "timeout", msgs24: 26, started: "crash loop · 14m" },
  ],

  agents: [
    { id: "concierge",   name: "Concierge",   desc: "Primary agent. Handles DMs, calendar, light sales, and routing to the brain for context.",
      model: "claude-sonnet-4.5",  av: "C", color: "oklch(0.65 0.15 280)", on: true,
      msgs24: 842, p50: "1.8s", confidence: 94, caps: ["brain.read", "brain.write", "calendar", "links.unfurl", "handoff"], primary: true },
    { id: "support_hub", name: "Support Hub", desc: "Customer-support specialist with ticket tooling, billing lookups, and bug-repro capture.",
      model: "claude-sonnet-4.5",  av: "S", color: "oklch(0.68 0.14 150)", on: true,
      msgs24: 312, p50: "2.4s", confidence: 89, caps: ["billing.read", "ticket.create", "repro.capture", "handoff"] },
    { id: "yt_mod",      name: "YT Mod",      desc: "Moderates YouTube live chat. Timeout / hide / escalate. Relays flagged items to WhatsApp.",
      model: "claude-haiku-4.5",   av: "Y", color: "oklch(0.66 0.17 30)", on: true,
      msgs24: 104, p50: "0.4s", confidence: 97, caps: ["yt.mod", "yt.relay", "pattern.match"] },
    { id: "sentinel",    name: "Sentinel",    desc: "Watchdog agent — never replies, just observes. Flags anomalies in other agents' outputs.",
      model: "claude-haiku-4.5",   av: "▲", color: "oklch(0.70 0.12 240)", on: true,
      msgs24: 0,  p50: "—",   confidence: 100, caps: ["observe", "anomaly.flag"] },
    { id: "scribe",      name: "Scribe",      desc: "Compacts long threads into brain memory nodes. Runs nightly on cron.",
      model: "claude-sonnet-4.5",  av: "§", color: "oklch(0.68 0.13 85)",  on: true,
      msgs24: 8,  p50: "18s",  confidence: 96, caps: ["brain.compact", "cron"] },
    { id: "playground",  name: "Playground",  desc: "Dev sandbox. Disabled in prod. Use for testing new prompts and tool chains.",
      model: "claude-sonnet-4.5",  av: "·", color: "oklch(0.55 0.04 60)",  on: false,
      msgs24: 0,  p50: "—",   confidence: "—", caps: ["*"] },
  ]
};
