export const PERMISSION_CATEGORIES = [
  "overview","conversations","claude_code","reviews","agents","agent_sessions",
  "youtube","cron","channels","tools","routing","relay","brain","capabilities",
  "commands","config","settings","logs","telemetry","auth","runtimes",
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export type PermissionMeta = {
  id: string;
  category: PermissionCategory;
  label: string;
  description: string;
};

export const PERMISSION_REGISTRY = {
  "overview.view":              { category: "overview",       label: "View overview",            description: "Read the overview page." },
  "conversations.view":         { category: "conversations",  label: "View conversations",        description: "List & inspect conversations and messages." },
  "conversations.takeover":     { category: "conversations",  label: "Takeover",                  description: "Enable human takeover." },
  "conversations.release":      { category: "conversations",  label: "Release takeover",          description: "Release human takeover." },
  "conversations.wake":         { category: "conversations",  label: "Wake conversation",         description: "Wake-now command." },
  "conversations.send":         { category: "conversations",  label: "Compose message",           description: "Send an outbound message." },
  "claude_code.view":           { category: "claude_code",    label: "View Claude Code",          description: "Read Claude Code sessions/transcripts." },
  "claude_code.resolve_pending": { category: "claude_code",   label: "Resolve pending",           description: "Approve/edit/discard pending items." },
  "claude_code.change_mode":    { category: "claude_code",    label: "Change session mode",       description: "Switch auto/manual." },
  "claude_code.summarize":      { category: "claude_code",    label: "Summarize session",         description: "Trigger LLM summary." },
  "claude_code.rename":         { category: "claude_code",    label: "Rename/end/resurrect",      description: "Rename or end/resurrect a session." },
  "reviews.view":               { category: "reviews",        label: "View reviews",              description: "Read projects/reports/ideas/inbox." },
  "reviews.triage":             { category: "reviews",        label: "Triage",                    description: "Set triage state and idea status." },
  "reviews.run_now":            { category: "reviews",        label: "Run review now",            description: "Queue a manual review." },
  "reviews.manage_projects":    { category: "reviews",        label: "Manage review projects",    description: "Add/enable/disable/ack." },
  "agents.view":                { category: "agents",         label: "View agents",               description: "List/read agents." },
  "agents.manage":              { category: "agents",         label: "Manage agents",             description: "Create/update/delete." },
  "agent_sessions.view":        { category: "agent_sessions", label: "View agent sessions",       description: "List/read sessions." },
  "agent_sessions.create":      { category: "agent_sessions", label: "Create session",            description: "Start a session." },
  "agent_sessions.send":        { category: "agent_sessions", label: "Send to session",           description: "Post a message." },
  "agent_sessions.reset":       { category: "agent_sessions", label: "Reset session",             description: "Reset." },
  "agent_sessions.abort":       { category: "agent_sessions", label: "Abort session",             description: "Abort." },
  "agent_sessions.compact":     { category: "agent_sessions", label: "Compact session",           description: "Compact." },
  "agent_sessions.delete":      { category: "agent_sessions", label: "Delete session",            description: "Delete." },
  "youtube.view":               { category: "youtube",        label: "View YouTube",              description: "Read summaries/jobs/chat." },
  "youtube.submit":             { category: "youtube",        label: "Submit job",                description: "Queue a video." },
  "youtube.chat":               { category: "youtube",        label: "Chat with video",           description: "Post chat messages." },
  "youtube.rebuild":            { category: "youtube",        label: "Rebuild",                   description: "Rebuild artifacts." },
  "youtube.rerun":              { category: "youtube",        label: "Rerun summary",             description: "Requeue." },
  "youtube.delete":             { category: "youtube",        label: "Delete summary",            description: "Delete summary + artifacts." },
  "cron.view":                  { category: "cron",           label: "View cron",                 description: "List + status." },
  "cron.manage":                { category: "cron",           label: "Manage cron",               description: "Add/remove." },
  "cron.run":                   { category: "cron",           label: "Run cron now",              description: "Trigger now." },
  "channels.view":              { category: "channels",       label: "View channels",             description: "Status." },
  "channels.logout":            { category: "channels",       label: "Logout channel",            description: "Force logout." },
  "tools.view":                 { category: "tools",          label: "View tools/skills",         description: "Read catalog." },
  "tools.install":              { category: "tools",          label: "Install skill",             description: "Install." },
  "routing.view":               { category: "routing",        label: "View routing",              description: "List rules." },
  "routing.manage":             { category: "routing",        label: "Manage routing",            description: "Create/update/delete." },
  "relay.view":                 { category: "relay",          label: "View relay recipients",     description: "List recipients." },
  "relay.manage":               { category: "relay",          label: "Manage relay recipients",   description: "Create/toggle/delete." },
  "brain.people.read":          { category: "brain",          label: "Read brain people",         description: "Read profiles." },
  "brain.people.write":         { category: "brain",          label: "Write brain people",        description: "Create/update/log." },
  "brain.global.read":          { category: "brain",          label: "Read global brain",         description: "Read global brain." },
  "brain.global.write":         { category: "brain",          label: "Write global brain",        description: "Modify global brain." },
  "capabilities.view":          { category: "capabilities",   label: "View capabilities",         description: "Read capabilities." },
  "capabilities.enroll":        { category: "capabilities",   label: "Enroll capability",         description: "Enroll/change." },
  "commands.run":               { category: "commands",       label: "Run management commands",   description: "Invoke management commands." },
  "commands.gateway_proxy":     { category: "commands",       label: "Call gateway methods",      description: "Arbitrary gateway-method proxy." },
  "config.raw.read":            { category: "config",         label: "Read raw config",           description: "Read gateway raw config." },
  "config.raw.write":           { category: "config",         label: "Write raw config",          description: "Set." },
  "config.raw.apply":           { category: "config",         label: "Apply raw config",          description: "Apply." },
  "settings.read":              { category: "settings",       label: "Read runtime settings",     description: "Read settings." },
  "settings.write":             { category: "settings",       label: "Write runtime settings",    description: "Modify settings." },
  "logs.read":                  { category: "logs",           label: "Read logs",                 description: "Logs + session transcripts." },
  "telemetry.read":             { category: "telemetry",      label: "Read telemetry",            description: "Query telemetry." },
  "auth.users.read":            { category: "auth",           label: "Read users",                description: "List users/assignments." },
  "auth.users.write":           { category: "auth",           label: "Manage users",              description: "CRUD + reset password + grants." },
  "auth.roles.read":            { category: "auth",           label: "Read roles",                description: "List roles." },
  "auth.roles.write":           { category: "auth",           label: "Manage roles",              description: "Create/update/delete." },
  "auth.providers.read":        { category: "auth",           label: "Read providers",            description: "View OIDC config." },
  "auth.providers.write":       { category: "auth",           label: "Manage providers",          description: "Modify OIDC." },
  "auth.sessions.read":         { category: "auth",           label: "Read sessions",             description: "List sessions." },
  "auth.sessions.revoke":       { category: "auth",           label: "Revoke sessions",           description: "Revoke sessions." },
  "auth.audit.read":            { category: "auth",           label: "Read audit",                description: "View audit log." },
  "runtimes.view":              { category: "runtimes",       label: "View runtimes",             description: "List runtimes + capability snapshots + activity." },
  "runtimes.invoke":            { category: "runtimes",       label: "Invoke runtime actions",    description: "Send actions to a runtime adapter." },
} as const satisfies Record<string, Omit<PermissionMeta, "id">>;

export type PermissionId = keyof typeof PERMISSION_REGISTRY;
export const ALL_PERMISSION_IDS: PermissionId[] = Object.keys(PERMISSION_REGISTRY) as PermissionId[];
export function getPermissionMeta(id: PermissionId): PermissionMeta { return { id, ...PERMISSION_REGISTRY[id] }; }
export function isPermissionId(s: string): s is PermissionId { return s in PERMISSION_REGISTRY; }
