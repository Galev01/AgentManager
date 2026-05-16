/* am-data-extra.js — Claude Code + Reviews mock data */

window.AM_DATA.claudeCode = {
  sessions: [
    { id:"cc_1jh8f", displayName:"Refactor auth middleware",  ide:"VS Code", workspace:"/karan/openclaw",    state:"active", mode:"agent",  messageCount:34, lastActivityAt:"2026-05-16T14:38:00Z", pending:2, needsDecision:true  },
    { id:"cc_2jh8g", displayName:"Add YouTube relay tests",   ide:"Cursor",  workspace:"/karan/openclaw",    state:"active", mode:"manual", messageCount:12, lastActivityAt:"2026-05-16T13:15:00Z", pending:0, needsDecision:false },
    { id:"cc_3jh8h", displayName:"Fix billing route 404",     ide:"VS Code", workspace:"/karan/support-hub", state:"ended",  mode:"agent",  messageCount:89, lastActivityAt:"2026-05-15T22:10:00Z", pending:0, needsDecision:false },
    { id:"cc_4jh8j", displayName:"Dashboard UI improvements", ide:"Cursor",  workspace:"/karan/openclaw",    state:"active", mode:"agent",  messageCount:5,  lastActivityAt:"2026-05-16T14:42:00Z", pending:1, needsDecision:false },
  ],
  detail: {
    id:"cc_1jh8f", displayName:"Refactor auth middleware", state:"active", mode:"agent",
    messageCount:34, ide:"VS Code", workspace:"/Users/karan/code/openclaw",
    sessionId:"agent:concierge:sess_01JH8F", createdAt:"2026-05-16T12:00:00Z",
    resolvedModel:"claude-opus-4-7", agentModel:"claude-sonnet-4-5",
    tokens:{ input:84320, output:12840, cacheRead:220000, cacheCreate:45000 },
    summary:"Refactoring the auth middleware to support multiple OIDC providers. Modified auth-middleware.ts, auth.ts, and added a new provider registry. 3 files changed, 2 added. Auth tests staged and ready to run.",
    transcript:[
      { kind:"ask",    text:"Can you help me refactor the auth middleware to support OIDC providers?",                                                     intent:"ask",    state:"answered" },
      { kind:"answer", text:"Sure! I'll start by mapping the current auth flow before making any changes.",                                                source:"agent"  },
      { kind:"mode_change", from:"manual", to:"agent" },
      { kind:"ask",    text:"Mapped the auth flow. OIDC support will require changes to auth-middleware.ts and a new provider-registry.ts. Proceed?",     intent:"decide", state:"answered" },
      { kind:"answer", text:"Yes, go ahead with the changes.",                                                                                             source:"operator" },
      { kind:"ask",    text:"Changes complete — 3 files modified, 2 added. Should I run the full auth test suite to verify everything still passes?",     intent:"decide", state:"blocked"  },
    ],
    pending:{ id:"pend_01", question:"Should I run the full auth test suite to verify the OIDC changes don't break existing flows?" }
  }
};

window.AM_DATA.reviews = {
  worker:{ current:"openclaw", queue:["support-hub"] },
  scanRoots:["/Users/karan/code", "/home/karan/projects"],
  projects:[
    { id:"p1", name:"openclaw",    path:"/Users/karan/code/openclaw",    status:"awaiting_ack", enabled:true,  lastRunAt:"2026-05-16T02:00:00Z", lastReportDate:"2026-05-16", eligibleAt:null,                   lastError:null,                        missing:false },
    { id:"p2", name:"support-hub", path:"/Users/karan/code/support-hub", status:"queued",       enabled:true,  lastRunAt:"2026-05-15T02:00:00Z", lastReportDate:"2026-05-15", eligibleAt:null,                   lastError:null,                        missing:false },
    { id:"p3", name:"yt-relay",    path:"/Users/karan/code/yt-relay",    status:"idle",         enabled:true,  lastRunAt:"2026-05-14T02:00:00Z", lastReportDate:"2026-05-14", eligibleAt:"2026-05-15T02:00:00Z", lastError:null,                        missing:false },
    { id:"p4", name:"brain-pkg",   path:"/Users/karan/code/brain-pkg",   status:"failed",       enabled:false, lastRunAt:"2026-05-13T02:00:00Z", lastReportDate:null,         eligibleAt:null,                   lastError:"Cannot find tsconfig.json", missing:false },
    { id:"p5", name:"legacy-api",  path:"/Users/karan/code/legacy-api",  status:"idle",         enabled:false, lastRunAt:null,                   lastReportDate:null,         eligibleAt:null,                   lastError:null,                        missing:true  },
  ],
  inbox:[
    { projectId:"p1", projectName:"openclaw",    reportDate:"2026-05-16", severity:"high",   triageState:"new",             ideasCount:4 },
    { projectId:"p1", projectName:"openclaw",    reportDate:"2026-05-15", severity:"medium", triageState:"actionable",      ideasCount:2 },
    { projectId:"p2", projectName:"support-hub", reportDate:"2026-05-15", severity:"low",    triageState:"new",             ideasCount:1 },
    { projectId:"p3", projectName:"yt-relay",    reportDate:"2026-05-14", severity:"medium", triageState:"needs_attention", ideasCount:3 },
    { projectId:"p3", projectName:"yt-relay",    reportDate:"2026-05-13", severity:"low",    triageState:"dismissed",       ideasCount:0 },
    { projectId:"p1", projectName:"openclaw",    reportDate:"2026-05-14", severity:"high",   triageState:"resolved",        ideasCount:5 },
  ]
};
