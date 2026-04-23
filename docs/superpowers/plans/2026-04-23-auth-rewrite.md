# Auth System Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy single-password auth in OpenClaw Manager with a production-ready user/role/permission system supporting local username+password login, OIDC (authorization code + PKCE), server-side sessions, and fine-grained authorization enforced on every dashboard page, API route, server action, sidebar entry, and bridge endpoint.

**Architecture:**
- Bridge (`apps/bridge`) owns all auth state under `MANAGEMENT_DIR/auth/` (users, roles, sessions, OIDC links, audit, bootstrap). Bridge is the **sole authorization authority** — it always re-resolves effective permissions from its own store on every request.
- Dashboard (`apps/dashboard`) stores nothing persistent. Middleware uses an opaque `ocm_sid` cookie (32 random bytes, base64url). On each request, `resolveSession()` asks the bridge `POST /auth/session/resolve` with the sid + a signed actor assertion (HMAC-SHA256 over `{sub, sid, iat, exp}`) plus the service bearer token. Bridge returns `{user, permissions[]}` or 401. Result cached **request-scoped only** via React `cache()`.
- Permissions: structured registry in `packages/types/src/auth/permissions.ts` (~60 ids with `{category, label, description}`). Users hold `roleIds[]` and `grants[]` (user-level `allow`/`deny`). Effective = `union(role allows) ∪ user allows − user denies`. **Role-level deny is disallowed in v1.**
- OIDC: single provider slot (env-configured) via `openid-client` v6. Default on OIDC login with no linked identity = **manual link required**. Auto-provision gated by `AUTH_OIDC_AUTO_PROVISION=true`.
- Bootstrap: `AUTH_BOOTSTRAP_TOKEN` env + `POST /auth/bootstrap` creates first admin. Legacy `ADMIN_PASSWORD` one-shot migration: when `users.json` is empty AND env is set, login form accepts the old password and creates an `admin` user in-line with an audit entry. After first user exists, both paths return 403.

**Tech Stack:**
- Bridge: Node 22, Express 5, `ws`, `node:crypto` (scrypt + HMAC), `openid-client` v6 (new), `node:test` via `tsx --test`.
- Dashboard: Next.js 15 App Router, React 19.
- Types: `packages/types/src/auth/` — `permissions.ts`, `users.ts`, `sessions.ts`, `audit.ts`, `oidc.ts`.

## Execution Protocol

This plan MUST be executed via `superpowers:subagent-driven-development`:
- **Fresh implementer subagent per task.** Never let one subagent own multiple tasks.
- After every task: (1) **spec-compliance review** subagent, (2) **code-quality review** subagent. Fix loop until both approve. Only then mark the task complete.
- Never start Phase N+1 tasks while Phase N has unresolved review issues.
- Final phase: dispatch `code-reviewer` for full-branch review before merging to `main`.

## Deny-Behavior Contract (applies to all phases)

| Surface | On missing permission |
|---|---|
| App Router page / layout | `redirect("/403")` from the server component. Do not render. |
| Server action | `throw new Error("FORBIDDEN: <perm>")` — UI catches and renders inline banner. |
| Dashboard API route | `return new NextResponse(JSON.stringify({ error: "forbidden", missing: "<perm>" }), { status: 403 })` |
| Unauthenticated (no session) at any dashboard layer | `redirect("/login?redirect=<encoded path>")` for pages, `401 {"error":"unauthorized"}` for JSON routes/actions. |
| Sidebar nav item | **Hide**. Do not render the link. |
| Action buttons / controls | **Hide** if the user can't perform the action. Disable only when the permission is present but the target state forbids it (e.g. takeover already active). |
| Bridge route | `res.status(403).json({ error: "forbidden", missing: "<perm>" })` |
| WS connection | Close with code `4003 "Forbidden"` if a permission gate applies (v1: only `4001 "Unauthorized"` for authn failure). |

## Actor Attribution Contract

Every telemetry event, audit entry, and bridge-side log MUST use the same actor shape:

```ts
type ActorRef =
  | { type: "user"; id: string; username: string }    // authenticated dashboard user
  | { type: "system"; id: string }                    // bridge-internal workers
  | { type: "bootstrap"; id: "bootstrap" }            // first-run bootstrap
  | { type: "oidc-provision"; id: "oidc-provision" }; // OIDC auto-provisioned (gated)
```

Resolution sites:
- Dashboard server-side: `const actor = await getCurrentUser(); // { id, username }` from `@/lib/auth/current-user.ts`.
- Dashboard telemetry route: overwrites actor from resolved session (never trusts client).
- Bridge side: pulls from `req.auth.user` (set by `actorAssertionAuth` middleware). If unauthenticated-but-legal (login/bootstrap/oidc-callback), omits actor.

## File-Write Contract (after P1 task 1.1)

After task 1.1 lands, **all new auth-related code MUST use helpers from `apps/bridge/src/services/atomic-file.ts`** — no ad-hoc `writeFile(tmp)+rename`, no bare `fs.appendFile` for JSONL. This contract also applies to any non-auth file the plan newly introduces.

---

## File Structure

**New bridge files:**

```
apps/bridge/src/services/atomic-file.ts
apps/bridge/src/services/auth/
  hash.ts
  session-store.ts
  store.ts
  permissions.ts
  assertion.ts
  audit.ts
  ws-ticket.ts
  service.ts
  oidc.ts
apps/bridge/src/auth-middleware.ts
apps/bridge/src/routes/auth.ts
apps/bridge/test/
  atomic-file.test.ts
  auth-hash.test.ts
  auth-session-store.test.ts
  auth-store.test.ts
  auth-permissions.test.ts
  auth-assertion.test.ts
  auth-audit.test.ts
  auth-ws-ticket.test.ts
  auth-service.test.ts
  auth-oidc.test.ts
  auth-routes.test.ts
  auth-bootstrap.test.ts
```

**Modified bridge files:**

```
apps/bridge/package.json             # + openid-client
apps/bridge/src/config.ts            # + auth env/paths
apps/bridge/src/server.ts            # wire /auth/*, middleware, startup
apps/bridge/src/ws.ts                # ticket OR bearer; strict ticket by P6
apps/bridge/src/auth.ts              # unchanged (kept as bearerAuth)
```

**New types files:**

```
packages/types/src/auth/
  permissions.ts
  users.ts
  sessions.ts
  audit.ts
  oidc.ts
  index.ts
```

**Modified types:**

```
packages/types/src/index.ts          # append: export * from "./auth/index.js"
```

**New dashboard files:**

```
apps/dashboard/src/lib/auth/
  bridge-auth-client.ts
  session.ts
  current-user.ts
  assertion.ts
apps/dashboard/src/app/api/auth/
  session/route.ts
  change-password/route.ts
  oidc/start/route.ts
  oidc/callback/route.ts
  ws-ticket/route.ts
apps/dashboard/src/app/403/page.tsx
apps/dashboard/src/app/change-password/page.tsx
apps/dashboard/src/app/admin/
  layout.tsx
  users/page.tsx
  users/new/page.tsx
  users/[id]/page.tsx
  users/[id]/actions.ts
  roles/page.tsx
  roles/new/page.tsx
  roles/[id]/page.tsx
  roles/actions.ts
  auth/page.tsx
  audit/page.tsx
  actions-common.ts
apps/dashboard/src/components/
  user-menu.tsx
  permission-gate.tsx
```

**Modified dashboard files:**

```
apps/dashboard/src/lib/bridge-client.ts                   # actor assertion header
apps/dashboard/src/lib/telemetry.ts                       # drop hardcoded "anon"
apps/dashboard/src/middleware.ts                          # sid presence + /login exception
apps/dashboard/src/app/login/page.tsx                     # username+password + OIDC button
apps/dashboard/src/app/api/auth/login/route.ts            # forwards to bridge /auth/login
apps/dashboard/src/app/api/auth/logout/route.ts           # forwards to bridge /auth/logout
apps/dashboard/src/app/api/telemetry/actions/route.ts     # actor from resolved session
apps/dashboard/src/components/sidebar.tsx                 # permission filter + user display
apps/dashboard/src/app/**/page.tsx                        # add requirePermission guards
apps/dashboard/src/app/api/**/route.ts                    # replace isAuthenticated with requirePermission
apps/dashboard/src/app/reviews/actions.ts                 # requirePermission per action
apps/dashboard/src/app/reviews/[projectId]/idea-actions.ts  # requirePermission per action
```

**Deleted:**

```
apps/dashboard/src/lib/session.ts   # superseded by src/lib/auth/session.ts
```

**Modified repo-level:**

```
.env.example                        # + AUTH_* and AUTH_OIDC_*
```

---

## Phase 1: Bridge Auth Domain

Goal: stand up file-backed auth (users/roles/sessions/audit/OIDC links/bootstrap), permission evaluation, assertion sign/verify, HTTP routes, middleware, and WS ticketing — all under tests. Dashboard keeps working via `strict: false` actor-assertion mode.

### Task 1.1: Atomic file helpers

**Files:**
- Create: `apps/bridge/src/services/atomic-file.ts`
- Test:   `apps/bridge/test/atomic-file.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/bridge/test/atomic-file.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { writeJsonAtomic, readJsonOrDefault, appendJsonl } from "../src/services/atomic-file.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "atomic-file-"));
}

test("writeJsonAtomic creates parents and writes pretty JSON", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "nested", "data.json");
  await writeJsonAtomic(file, { a: 1 });
  const raw = await fs.readFile(file, "utf8");
  assert.equal(raw, JSON.stringify({ a: 1 }, null, 2) + "\n");
});

test("writeJsonAtomic replaces existing file", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "data.json");
  await writeJsonAtomic(file, { v: 1 });
  await writeJsonAtomic(file, { v: 2 });
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), { v: 2 });
});

test("readJsonOrDefault returns default on missing", async () => {
  const dir = await tmpDir();
  assert.deepEqual(await readJsonOrDefault(path.join(dir, "missing.json"), { n: 42 }), { n: 42 });
});

test("readJsonOrDefault returns default on parse error", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "bad.json");
  await fs.writeFile(file, "{bad", "utf8");
  assert.deepEqual(await readJsonOrDefault(file, { n: 7 }), { n: 7 });
});

test("appendJsonl serializes concurrent appends", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "log.jsonl");
  await Promise.all(Array.from({ length: 20 }, (_, i) => appendJsonl(file, { i })));
  const raw = await fs.readFile(file, "utf8");
  const lines = raw.trim().split("\n");
  assert.equal(lines.length, 20);
  for (const l of lines) JSON.parse(l);
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="atomic"
```

- [ ] **Step 3: Implement**

```typescript
// apps/bridge/src/services/atomic-file.ts
import fs from "node:fs/promises";
import path from "node:path";

const appendLocks = new Map<string, Promise<unknown>>();

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

export async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function appendJsonl(filePath: string, data: unknown): Promise<void> {
  const prev = appendLocks.get(filePath) ?? Promise.resolve();
  const next = prev.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(data) + "\n", "utf8");
  });
  appendLocks.set(filePath, next.catch(() => undefined));
  await next;
}
```

- [ ] **Step 4: Run — expect PASS (5 tests)**

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/atomic-file.ts apps/bridge/test/atomic-file.test.ts
git commit -m "feat(bridge): add atomic JSON write + serialized JSONL append helpers"
```

### Task 1.2: Permission registry + types/auth module

**Files:**
- Create: `packages/types/src/auth/permissions.ts`
- Create: `packages/types/src/auth/index.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write `permissions.ts`**

```typescript
// packages/types/src/auth/permissions.ts
export const PERMISSION_CATEGORIES = [
  "overview","conversations","claude_code","reviews","agents","agent_sessions",
  "youtube","cron","channels","tools","routing","relay","brain","capabilities",
  "commands","config","settings","logs","telemetry","auth",
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
} as const satisfies Record<string, Omit<PermissionMeta, "id">>;

// NOTE: Self-service "link my own OIDC identity" is NOT a permissioned capability —
// any authenticated user may link their own account. See P1 Task 1.16 route + P5 Task 5.3.

export type PermissionId = keyof typeof PERMISSION_REGISTRY;
export const ALL_PERMISSION_IDS: PermissionId[] = Object.keys(PERMISSION_REGISTRY) as PermissionId[];
export function getPermissionMeta(id: PermissionId): PermissionMeta { return { id, ...PERMISSION_REGISTRY[id] }; }
export function isPermissionId(s: string): s is PermissionId { return s in PERMISSION_REGISTRY; }
```

- [ ] **Step 2: Create `auth/index.ts`**

```typescript
export * from "./permissions.js";
export * from "./users.js";
export * from "./sessions.js";
export * from "./audit.js";
export * from "./oidc.js";
```

- [ ] **Step 3: Re-export from `packages/types/src/index.ts`**

Append at the end of the file:

```typescript
export * from "./auth/index.js";
```

- [ ] **Step 4: Do NOT build yet** — users.ts / sessions.ts / audit.ts / oidc.ts are added in 1.3/1.4/1.5. Commit at the end of 1.5.

### Task 1.3: Auth types — users/roles

**Files:**
- Create: `packages/types/src/auth/users.ts`

```typescript
// packages/types/src/auth/users.ts
import type { PermissionId } from "./permissions.js";

export type AuthUserStatus = "active" | "disabled";
export type AuthGrantKind = "allow" | "deny";
export type AuthGrant = { permissionId: PermissionId; kind: AuthGrantKind };

export type AuthLinkedIdentity = {
  providerKey: string;
  issuer: string;
  sub: string;
  email?: string;
  displayName?: string;
  linkedAt: string;
};

export type AuthLocalCreds = { passwordHash: string; passwordUpdatedAt: string };

export type AuthUser = {
  id: string;
  username: string;
  usernameKey: string;
  displayName?: string;
  email?: string;
  status: AuthUserStatus;
  local?: AuthLocalCreds;
  roleIds: string[];
  grants: AuthGrant[];
  linkedIdentities: AuthLinkedIdentity[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type AuthUserPublic = Omit<AuthUser, "local" | "usernameKey"> & {
  hasLocalPassword: boolean;
};

export type AuthRole = {
  id: string;
  name: string;
  description?: string;
  system: boolean;
  grants: Array<{ permissionId: PermissionId; kind: "allow" }>;
  createdAt: string;
  updatedAt: string;
};

export type AuthUsersFile = { version: 1; users: Record<string, AuthUser> };
export type AuthRolesFile = { version: 1; roles: Record<string, AuthRole> };

export type AuthUserCreateInput = {
  username: string;
  displayName?: string;
  email?: string;
  password?: string;
  roleIds?: string[];
  grants?: AuthGrant[];
  status?: AuthUserStatus;
};

export type AuthUserUpdateInput = {
  displayName?: string;
  email?: string;
  status?: AuthUserStatus;
  roleIds?: string[];
  grants?: AuthGrant[];
};

export type AuthRoleCreateInput = { name: string; description?: string; grants?: PermissionId[] };
export type AuthRoleUpdateInput = { name?: string; description?: string; grants?: PermissionId[] };
```

### Task 1.4: Auth types — sessions, WS ticket

**Files:**
- Create: `packages/types/src/auth/sessions.ts`

```typescript
// packages/types/src/auth/sessions.ts
import type { PermissionId } from "./permissions.js";
import type { AuthUserPublic } from "./users.js";

export type AuthSession = {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  userAgent?: string;
  ip?: string;
  origin: "local" | "oidc";
};

export type AuthSessionResolveRequest = { sid: string; userAgent?: string; ip?: string };
export type AuthSessionResolveResponse = {
  user: AuthUserPublic;
  permissions: PermissionId[];
  session: { id: string; expiresAt: string };
};

export type AuthLoginRequest = { username: string; password: string; userAgent?: string; ip?: string };
export type AuthLoginResponse = {
  sessionId: string;
  expiresAt: string;
  user: AuthUserPublic;
  permissions: PermissionId[];
};

export type WsTicketResponse = { ticket: string; expiresAt: string };
```

### Task 1.5: Auth types — audit, OIDC; commit types

**Files:**
- Create: `packages/types/src/auth/audit.ts`
- Create: `packages/types/src/auth/oidc.ts`

```typescript
// packages/types/src/auth/audit.ts
export type AuthAuditKind =
  | "login.success" | "login.failure" | "login.disabled" | "logout"
  | "session.revoked" | "session.expired"
  | "user.created" | "user.updated" | "user.enabled" | "user.disabled" | "user.deleted"
  | "user.password_changed" | "user.password_reset"
  | "role.created" | "role.updated" | "role.deleted" | "role.assigned" | "role.unassigned"
  | "grant.set"
  | "oidc.login.success" | "oidc.login.unlinked"
  | "oidc.link.added" | "oidc.link.removed"
  | "bootstrap.success" | "bootstrap.legacy_migration";

export type AuthAuditEntry = {
  at: string;
  kind: AuthAuditKind;
  actorUserId?: string;
  actorUsername?: string;
  targetUserId?: string;
  targetUsername?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, string | number | boolean>;
};
```

```typescript
// packages/types/src/auth/oidc.ts
export type OidcProviderConfig = {
  key: string;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  autoProvision: boolean;
};

export type OidcPublicConfig = { enabled: boolean; displayName?: string };

export type OidcStartResponse = { authorizationUrl: string; state: string };

export type OidcCallbackResult =
  | { kind: "logged_in"; sessionId: string; expiresAt: string }
  | { kind: "unlinked"; issuer: string; sub: string; email?: string }
  | { kind: "error"; code: string; message: string };
```

- [ ] **Build & commit**

```bash
cd packages/types && pnpm build
git add packages/types/src/auth packages/types/src/index.ts
git commit -m "feat(types): add auth permission registry + user/role/session/audit/oidc types"
```

### Task 1.6: Bridge config — auth env + paths

**Files:**
- Modify: `apps/bridge/src/config.ts`

- [ ] **Step 1: Add new env reads inside `config` object (before closing `} as const;`):**

```typescript
  // --- Auth ---
  authAssertionSecret: process.env.AUTH_ASSERTION_SECRET || "",
  authBootstrapToken: process.env.AUTH_BOOTSTRAP_TOKEN || "",
  authSessionTtlMs: Number(process.env.AUTH_SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000,
  authSessionLastSeenThrottleMs: Number(process.env.AUTH_SESSION_LASTSEEN_THROTTLE_MS) || 60 * 1000,
  authWsTicketTtlMs: Number(process.env.AUTH_WS_TICKET_TTL_MS) || 60 * 1000,
  authLegacyAdminPassword: process.env.ADMIN_PASSWORD || "",
  oidcIssuerUrl: process.env.AUTH_OIDC_ISSUER_URL || "",
  oidcClientId: process.env.AUTH_OIDC_CLIENT_ID || "",
  oidcClientSecret: process.env.AUTH_OIDC_CLIENT_SECRET || "",
  oidcRedirectUri: process.env.AUTH_OIDC_REDIRECT_URI || "",
  oidcScopes: (process.env.AUTH_OIDC_SCOPES || "openid email profile").split(/\s+/).filter(Boolean),
  oidcProviderName: process.env.AUTH_OIDC_PROVIDER_NAME || "Single Sign-On",
  oidcProviderKey: process.env.AUTH_OIDC_PROVIDER_KEY || "default",
  oidcAutoProvision: process.env.AUTH_OIDC_AUTO_PROVISION === "true",
  get authDir():       string { return path.join(this.managementDir, "auth"); },
  get authUsersPath(): string { return path.join(this.managementDir, "auth", "users.json"); },
  get authRolesPath(): string { return path.join(this.managementDir, "auth", "roles.json"); },
  get authOidcLinksPath(): string { return path.join(this.managementDir, "auth", "oidc-links.json"); },
  get authBootstrapPath(): string { return path.join(this.managementDir, "auth", "bootstrap.json"); },
  get authSessionsDir(): string { return path.join(this.managementDir, "auth", "sessions"); },
  get authAuditPath():  string { return path.join(this.managementDir, "auth", "audit.jsonl"); },
```

- [ ] **Step 2: Add startup check just above `export const config = {`**

```typescript
function requireAuthAssertionSecret(): void {
  if (!process.env.AUTH_ASSERTION_SECRET || process.env.AUTH_ASSERTION_SECRET.length < 32) {
    throw new Error("AUTH_ASSERTION_SECRET must be set and ≥ 32 chars");
  }
}
requireAuthAssertionSecret();
```

- [ ] **Step 3: Build + commit**

```bash
cd apps/bridge && pnpm build
git add apps/bridge/src/config.ts
git commit -m "feat(bridge): add auth env + paths to config"
```

### Task 1.7: Password hashing (scrypt-v1)

**Files:**
- Create: `apps/bridge/src/services/auth/hash.ts`
- Test:   `apps/bridge/test/auth-hash.test.ts`

- [ ] **Test (write first, expect FAIL)**

```typescript
// apps/bridge/test/auth-hash.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/services/auth/hash.js";

test("hashPassword produces scrypt-v1 format", async () => {
  const h = await hashPassword("x");
  assert.ok(h.startsWith("scrypt-v1$"));
  assert.equal(h.split("$").length, 6);
});

test("verifyPassword: correct password", async () => {
  const h = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter2", h), true);
});

test("verifyPassword: wrong password", async () => {
  const h = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter3", h), false);
});

test("verifyPassword: malformed hash", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", "scrypt-v1$bad"), false);
});

test("two hashes of same password differ (unique salt)", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/hash.ts
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number },
) => Promise<Buffer>;

const PARAMS = { N: 32768, r: 8, p: 1, keylen: 64 };
const PREFIX = "scrypt-v1";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p });
  return [PREFIX, `N=${PARAMS.N}`, `r=${PARAMS.r}`, `p=${PARAMS.p}`, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [prefix, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  if (prefix !== PREFIX) return false;
  const N = Number(nRaw.replace(/^N=/, ""));
  const r = Number(rRaw.replace(/^r=/, ""));
  const p = Number(pRaw.replace(/^p=/, ""));
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer, expected: Buffer;
  try { salt = Buffer.from(saltB64, "base64"); expected = Buffer.from(hashB64, "base64"); }
  catch { return false; }
  const actual = await scrypt(password, salt, expected.length, { N, r, p });
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
```

- [ ] **Run tests + commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="hash"
git add apps/bridge/src/services/auth/hash.ts apps/bridge/test/auth-hash.test.ts
git commit -m "feat(bridge): scrypt-v1 password hashing with constant-time verify"
```

### Task 1.8: Session store (per-file JSON)

**Files:**
- Create: `apps/bridge/src/services/auth/session-store.ts`
- Test:   `apps/bridge/test/auth-session-store.test.ts`

- [ ] **Test**

```typescript
// apps/bridge/test/auth-session-store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createSessionStore } from "../src/services/auth/session-store.js";

async function mk(ttlMs = 60_000, throttleMs = 1_000) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sess-"));
  return { dir, store: createSessionStore({ dir, ttlMs, lastSeenThrottleMs: throttleMs }) };
}

test("create + get", async () => {
  const { store } = await mk();
  const c = await store.create({ userId: "u1", origin: "local" });
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(c.id));
  const g = await store.get(c.id);
  assert.equal(g?.userId, "u1");
});

test("get returns null for missing", async () => {
  const { store } = await mk();
  assert.equal(await store.get("nope"), null);
});

test("expired session is deleted on read", async () => {
  const { dir, store } = await mk(0, 0);
  const c = await store.create({ userId: "u1", origin: "local" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await store.get(c.id), null);
  const files = await fs.readdir(dir);
  assert.ok(!files.includes(`${c.id}.json`));
});

test("touch updates lastSeenAt past throttle", async () => {
  const { store } = await mk(60_000, 1_000);
  const c = await store.create({ userId: "u1", origin: "local" });
  await new Promise((r) => setTimeout(r, 1100));
  const t = await store.touch(c.id);
  assert.ok(new Date(t!.lastSeenAt) > new Date(c.lastSeenAt));
});

test("touch no-op within throttle", async () => {
  const { store } = await mk(60_000, 60_000);
  const c = await store.create({ userId: "u1", origin: "local" });
  const t = await store.touch(c.id);
  assert.equal(t?.lastSeenAt, c.lastSeenAt);
});

test("revoke deletes", async () => {
  const { store } = await mk();
  const c = await store.create({ userId: "u1", origin: "local" });
  await store.revoke(c.id);
  assert.equal(await store.get(c.id), null);
});

test("revokeAllForUser", async () => {
  const { store } = await mk();
  const a1 = await store.create({ userId: "a", origin: "local" });
  const a2 = await store.create({ userId: "a", origin: "local" });
  const b1 = await store.create({ userId: "b", origin: "local" });
  const n = await store.revokeAllForUser("a");
  assert.equal(n, 2);
  assert.equal(await store.get(a1.id), null);
  assert.equal(await store.get(a2.id), null);
  assert.ok(await store.get(b1.id));
});

test("listForUser filters by expiry", async () => {
  const { store } = await mk();
  await store.create({ userId: "a", origin: "local" });
  await store.create({ userId: "a", origin: "oidc" });
  await store.create({ userId: "b", origin: "local" });
  assert.equal((await store.listForUser("a")).length, 2);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/session-store.ts
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { AuthSession } from "@openclaw-manager/types";
import { writeJsonAtomic, readJsonOrDefault } from "../atomic-file.js";

export type SessionStoreConfig = { dir: string; ttlMs: number; lastSeenThrottleMs: number };

export type CreateSessionInput = {
  userId: string;
  origin: "local" | "oidc";
  userAgent?: string;
  ip?: string;
};

export type SessionStore = {
  create(input: CreateSessionInput): Promise<AuthSession>;
  get(sid: string): Promise<AuthSession | null>;
  touch(sid: string): Promise<AuthSession | null>;
  revoke(sid: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  listForUser(userId: string): Promise<AuthSession[]>;
  sweep(): Promise<number>;
};

function newSid(): string { return crypto.randomBytes(32).toString("base64url"); }
function fileFor(dir: string, sid: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(sid)) throw new Error("invalid sid");
  return path.join(dir, `${sid}.json`);
}

export function createSessionStore(cfg: SessionStoreConfig): SessionStore {
  return {
    async create(input) {
      const now = new Date();
      const sess: AuthSession = {
        id: newSid(),
        userId: input.userId,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + cfg.ttlMs).toISOString(),
        origin: input.origin,
        userAgent: input.userAgent,
        ip: input.ip,
      };
      await writeJsonAtomic(fileFor(cfg.dir, sess.id), sess);
      return sess;
    },
    async get(sid) {
      const sess = await readJsonOrDefault<AuthSession | null>(fileFor(cfg.dir, sid), null);
      if (!sess) return null;
      if (new Date(sess.expiresAt).getTime() <= Date.now()) {
        await fs.unlink(fileFor(cfg.dir, sid)).catch(() => undefined);
        return null;
      }
      if (sess.revokedAt) return null;
      return sess;
    },
    async touch(sid) {
      const sess = await this.get(sid);
      if (!sess) return null;
      if (Date.now() - new Date(sess.lastSeenAt).getTime() < cfg.lastSeenThrottleMs) return sess;
      const next: AuthSession = { ...sess, lastSeenAt: new Date().toISOString() };
      await writeJsonAtomic(fileFor(cfg.dir, sid), next);
      return next;
    },
    async revoke(sid) { await fs.unlink(fileFor(cfg.dir, sid)).catch(() => undefined); },
    async revokeAllForUser(userId) {
      let count = 0;
      let entries: string[] = [];
      try { entries = await fs.readdir(cfg.dir); } catch { return 0; }
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        const full = path.join(cfg.dir, e);
        try {
          const sess: AuthSession = JSON.parse(await fs.readFile(full, "utf8"));
          if (sess.userId === userId) { await fs.unlink(full).catch(() => undefined); count++; }
        } catch {}
      }
      return count;
    },
    async listForUser(userId) {
      let entries: string[] = [];
      try { entries = await fs.readdir(cfg.dir); } catch { return []; }
      const out: AuthSession[] = [];
      const now = Date.now();
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        try {
          const sess: AuthSession = JSON.parse(await fs.readFile(path.join(cfg.dir, e), "utf8"));
          if (sess.userId !== userId) continue;
          if (new Date(sess.expiresAt).getTime() <= now) continue;
          if (sess.revokedAt) continue;
          out.push(sess);
        } catch {}
      }
      return out;
    },
    async sweep() {
      let entries: string[] = [];
      try { entries = await fs.readdir(cfg.dir); } catch { return 0; }
      const now = Date.now();
      let n = 0;
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        const full = path.join(cfg.dir, e);
        try {
          const sess: AuthSession = JSON.parse(await fs.readFile(full, "utf8"));
          if (new Date(sess.expiresAt).getTime() <= now) { await fs.unlink(full).catch(() => undefined); n++; }
        } catch { await fs.unlink(full).catch(() => undefined); n++; }
      }
      return n;
    },
  };
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="session-store"
git add apps/bridge/src/services/auth/session-store.ts apps/bridge/test/auth-session-store.test.ts
git commit -m "feat(bridge): per-file session store with TTL + lastSeen throttling"
```

### Task 1.9: Permission evaluator

**Files:**
- Create: `apps/bridge/src/services/auth/permissions.ts`
- Test:   `apps/bridge/test/auth-permissions.test.ts`

- [ ] **Test**

```typescript
// apps/bridge/test/auth-permissions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateEffective } from "../src/services/auth/permissions.js";
import type { AuthUser, AuthRole } from "@openclaw-manager/types";

function mkUser(p: Partial<AuthUser> = {}): AuthUser {
  return { id: "u", username: "u", usernameKey: "u", status: "active", roleIds: [], grants: [], linkedIdentities: [], createdAt: "", updatedAt: "", ...p };
}
function mkRole(p: Partial<AuthRole> = {}): AuthRole {
  return { id: "r", name: "r", system: false, grants: [], createdAt: "", updatedAt: "", ...p };
}

test("disabled user has zero permissions", () => {
  const u = mkUser({ status: "disabled", grants: [{ permissionId: "overview.view", kind: "allow" }] });
  assert.deepEqual(evaluateEffective(u, []), []);
});
test("direct allow", () => {
  assert.deepEqual(evaluateEffective(mkUser({ grants: [{ permissionId: "overview.view", kind: "allow" }] }), []), ["overview.view"]);
});
test("role allow", () => {
  const r = mkRole({ id: "r1", grants: [{ permissionId: "conversations.view", kind: "allow" }] });
  assert.deepEqual(evaluateEffective(mkUser({ roleIds: ["r1"] }), [r]), ["conversations.view"]);
});
test("user deny overrides role allow", () => {
  const r = mkRole({ id: "r1", grants: [{ permissionId: "conversations.view", kind: "allow" }] });
  const u = mkUser({ roleIds: ["r1"], grants: [{ permissionId: "conversations.view", kind: "deny" }] });
  assert.deepEqual(evaluateEffective(u, [r]), []);
});
test("user deny overrides direct allow", () => {
  const u = mkUser({ grants: [
    { permissionId: "agents.view", kind: "allow" },
    { permissionId: "agents.view", kind: "deny" },
  ]});
  assert.deepEqual(evaluateEffective(u, []), []);
});
test("union across roles", () => {
  const roles = [
    mkRole({ id: "a", grants: [{ permissionId: "overview.view", kind: "allow" }] }),
    mkRole({ id: "b", grants: [{ permissionId: "agents.view", kind: "allow" }] }),
  ];
  assert.deepEqual(evaluateEffective(mkUser({ roleIds: ["a", "b"] }), roles).sort(), ["agents.view", "overview.view"]);
});
test("missing role ignored", () => {
  assert.deepEqual(evaluateEffective(mkUser({ roleIds: ["nope"] }), []), []);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/permissions.ts
import type { AuthUser, AuthRole, PermissionId } from "@openclaw-manager/types";

export function evaluateEffective(user: AuthUser, allRoles: AuthRole[]): PermissionId[] {
  if (user.status === "disabled") return [];
  const roleById = new Map(allRoles.map((r) => [r.id, r]));
  const allows = new Set<PermissionId>();
  for (const rid of user.roleIds) {
    const role = roleById.get(rid);
    if (!role) continue;
    for (const g of role.grants) if (g.kind === "allow") allows.add(g.permissionId);
  }
  for (const g of user.grants) if (g.kind === "allow") allows.add(g.permissionId);
  for (const g of user.grants) if (g.kind === "deny") allows.delete(g.permissionId);
  return Array.from(allows).sort();
}

export function hasPermission(effective: PermissionId[], perm: PermissionId): boolean {
  return effective.includes(perm);
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="auth-permissions"
git add apps/bridge/src/services/auth/permissions.ts apps/bridge/test/auth-permissions.test.ts
git commit -m "feat(bridge): permission evaluator with user-deny precedence (role-level deny disallowed in v1)"
```

### Task 1.10: Auth store (users/roles/oidc links/bootstrap)

**Files:**
- Create: `apps/bridge/src/services/auth/store.ts`
- Test:   `apps/bridge/test/auth-store.test.ts`

- [ ] **Test** — cover: `isEmpty`, create user lowercases key, duplicate username rejected (case-insensitive), update/delete user, setLocalPassword, role create/list/update/delete, system role upsert + cannot-modify-grants, OIDC link/find/unlink, bootstrap state read/write.

```typescript
// apps/bridge/test/auth-store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuthStore } from "../src/services/auth/store.js";

async function mk() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-store-"));
  return createAuthStore({
    usersPath: path.join(dir, "users.json"),
    rolesPath: path.join(dir, "roles.json"),
    linksPath: path.join(dir, "oidc-links.json"),
    bootstrapPath: path.join(dir, "bootstrap.json"),
  });
}

test("empty initially", async () => {
  const s = await mk(); assert.equal(await s.isEmpty(), true);
});
test("createUser lowercases key and dedups case-insensitively", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "Alice", roleIds: ["admin"] });
  assert.equal(u.usernameKey, "alice");
  assert.deepEqual(await s.findByUsername("ALICE"), u);
  await assert.rejects(() => s.createUser({ username: "alice" }), /already exists/);
});
test("updateUser patches fields", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "x" });
  const p = await s.updateUser(u.id, { displayName: "Mr X", status: "disabled" });
  assert.equal(p.displayName, "Mr X");
  assert.equal(p.status, "disabled");
});
test("setLocalPassword / clearLocalPassword / recordLogin / deleteUser", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "c" });
  await s.setLocalPassword(u.id, "scrypt-v1$stub");
  assert.equal((await s.getUser(u.id))?.local?.passwordHash, "scrypt-v1$stub");
  await s.clearLocalPassword(u.id);
  assert.equal((await s.getUser(u.id))?.local, undefined);
  await s.recordLogin(u.id);
  assert.ok((await s.getUser(u.id))?.lastLoginAt);
  await s.deleteUser(u.id);
  assert.equal(await s.getUser(u.id), null);
});
test("roles: create/list/update/delete + system roles protected", async () => {
  const s = await mk();
  const r = await s.createRole({ name: "Op", grants: ["overview.view"] });
  assert.equal(r.system, false);
  const patched = await s.updateRole(r.id, { description: "ops" });
  assert.equal(patched.description, "ops");
  await s.deleteRole(r.id);
  assert.equal(await s.getRole(r.id), null);
  const sr = await s.upsertSystemRole("admin", { name: "Admin", grants: ["overview.view"] });
  assert.equal(sr.system, true);
  await assert.rejects(() => s.updateRole("admin", { grants: ["agents.view"] }), /system role/);
  await assert.rejects(() => s.deleteRole("admin"), /system role/);
});
test("oidc link add/find/remove", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "o" });
  await s.linkOidc(u.id, { providerKey: "default", issuer: "https://iss", sub: "s1" });
  assert.equal((await s.findUserByOidc("default", "https://iss", "s1"))?.id, u.id);
  await s.unlinkOidc(u.id, "default", "https://iss", "s1");
  assert.equal(await s.findUserByOidc("default", "https://iss", "s1"), null);
});
test("bootstrap markers", async () => {
  const s = await mk();
  assert.equal(await s.bootstrapCompletedAt(), null);
  await s.markBootstrapComplete("u1");
  assert.ok(await s.bootstrapCompletedAt());
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/store.ts
import crypto from "node:crypto";
import type {
  AuthUser, AuthUsersFile, AuthRole, AuthRolesFile,
  AuthUserCreateInput, AuthUserUpdateInput,
  AuthRoleCreateInput, AuthRoleUpdateInput,
  AuthLinkedIdentity, PermissionId,
} from "@openclaw-manager/types";
import { writeJsonAtomic, readJsonOrDefault } from "../atomic-file.js";

export type AuthStoreConfig = {
  usersPath: string; rolesPath: string; linksPath: string; bootstrapPath: string;
};
type LinksFile = { version: 1; links: Record<string, string> };
type BootstrapFile = { version: 1; completedAt?: string; completedByUserId?: string };

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}
function normUsername(u: string): string { return u.trim().toLowerCase(); }
function lk(providerKey: string, issuer: string, sub: string): string {
  return `${providerKey}|${issuer}|${sub}`;
}

export type AuthStore = ReturnType<typeof createAuthStore>;

export function createAuthStore(cfg: AuthStoreConfig) {
  const locks = new Map<string, Promise<unknown>>();
  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => undefined));
    return next;
  }
  async function rUsers(): Promise<AuthUsersFile> { return readJsonOrDefault(cfg.usersPath, { version: 1, users: {} }); }
  async function rRoles(): Promise<AuthRolesFile> { return readJsonOrDefault(cfg.rolesPath, { version: 1, roles: {} }); }
  async function rLinks(): Promise<LinksFile>     { return readJsonOrDefault(cfg.linksPath, { version: 1, links: {} }); }
  async function rBoot():  Promise<BootstrapFile> { return readJsonOrDefault(cfg.bootstrapPath, { version: 1 }); }

  return {
    async isEmpty(): Promise<boolean> {
      return Object.keys((await rUsers()).users).length === 0;
    },
    async listUsers(): Promise<AuthUser[]> { return Object.values((await rUsers()).users); },
    async getUser(id: string): Promise<AuthUser | null> { return (await rUsers()).users[id] ?? null; },
    async findByUsername(username: string): Promise<AuthUser | null> {
      const key = normUsername(username);
      for (const u of Object.values((await rUsers()).users)) if (u.usernameKey === key) return u;
      return null;
    },
    async createUser(input: AuthUserCreateInput): Promise<AuthUser> {
      return withLock("users", async () => {
        const f = await rUsers();
        const key = normUsername(input.username);
        for (const u of Object.values(f.users)) if (u.usernameKey === key) throw new Error("user already exists");
        const now = new Date().toISOString();
        const u: AuthUser = {
          id: newId("user"),
          username: input.username.trim(),
          usernameKey: key,
          displayName: input.displayName,
          email: input.email,
          status: input.status ?? "active",
          roleIds: input.roleIds ?? [],
          grants: input.grants ?? [],
          linkedIdentities: [],
          createdAt: now, updatedAt: now,
        };
        f.users[u.id] = u;
        await writeJsonAtomic(cfg.usersPath, f);
        return u;
      });
    },
    async updateUser(id: string, patch: AuthUserUpdateInput): Promise<AuthUser> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) throw new Error("user not found");
        const next: AuthUser = {
          ...u,
          displayName: patch.displayName ?? u.displayName,
          email: patch.email ?? u.email,
          status: patch.status ?? u.status,
          roleIds: patch.roleIds ?? u.roleIds,
          grants: patch.grants ?? u.grants,
          updatedAt: new Date().toISOString(),
        };
        f.users[id] = next;
        await writeJsonAtomic(cfg.usersPath, f);
        return next;
      });
    },
    async setLocalPassword(id: string, hash: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) throw new Error("user not found");
        u.local = { passwordHash: hash, passwordUpdatedAt: new Date().toISOString() };
        u.updatedAt = u.local.passwordUpdatedAt;
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async clearLocalPassword(id: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) throw new Error("user not found");
        delete u.local;
        u.updatedAt = new Date().toISOString();
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async recordLogin(id: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) return;
        u.lastLoginAt = new Date().toISOString();
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async deleteUser(id: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        delete f.users[id];
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async listRoles(): Promise<AuthRole[]> { return Object.values((await rRoles()).roles); },
    async getRole(id: string): Promise<AuthRole | null> { return (await rRoles()).roles[id] ?? null; },
    async createRole(input: AuthRoleCreateInput): Promise<AuthRole> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const now = new Date().toISOString();
        const r: AuthRole = {
          id: newId("role"),
          name: input.name,
          description: input.description,
          system: false,
          grants: (input.grants ?? []).map((permissionId) => ({ permissionId, kind: "allow" })),
          createdAt: now, updatedAt: now,
        };
        f.roles[r.id] = r;
        await writeJsonAtomic(cfg.rolesPath, f);
        return r;
      });
    },
    async upsertSystemRole(id: string, input: { name: string; description?: string; grants: PermissionId[] }): Promise<AuthRole> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const now = new Date().toISOString();
        const existing = f.roles[id];
        const r: AuthRole = {
          id, name: input.name, description: input.description, system: true,
          grants: input.grants.map((permissionId) => ({ permissionId, kind: "allow" })),
          createdAt: existing?.createdAt ?? now, updatedAt: now,
        };
        f.roles[id] = r;
        await writeJsonAtomic(cfg.rolesPath, f);
        return r;
      });
    },
    async updateRole(id: string, patch: AuthRoleUpdateInput): Promise<AuthRole> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const r = f.roles[id];
        if (!r) throw new Error("role not found");
        if (r.system && patch.grants) throw new Error("cannot modify grants of system role");
        const next: AuthRole = {
          ...r,
          name: patch.name ?? r.name,
          description: patch.description ?? r.description,
          grants: patch.grants ? patch.grants.map((permissionId) => ({ permissionId, kind: "allow" })) : r.grants,
          updatedAt: new Date().toISOString(),
        };
        f.roles[id] = next;
        await writeJsonAtomic(cfg.rolesPath, f);
        return next;
      });
    },
    async deleteRole(id: string): Promise<void> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const r = f.roles[id];
        if (r?.system) throw new Error("cannot delete system role");
        delete f.roles[id];
        await writeJsonAtomic(cfg.rolesPath, f);
      });
    },
    async linkOidc(userId: string, input: Omit<AuthLinkedIdentity, "linkedAt">): Promise<void> {
      return withLock("links", async () => {
        const users = await rUsers();
        const u = users.users[userId];
        if (!u) throw new Error("user not found");
        const linked: AuthLinkedIdentity = { ...input, linkedAt: new Date().toISOString() };
        u.linkedIdentities = [
          ...u.linkedIdentities.filter(
            (x) => !(x.providerKey === input.providerKey && x.issuer === input.issuer && x.sub === input.sub),
          ),
          linked,
        ];
        u.updatedAt = linked.linkedAt;
        await writeJsonAtomic(cfg.usersPath, users);
        const links = await rLinks();
        links.links[lk(input.providerKey, input.issuer, input.sub)] = userId;
        await writeJsonAtomic(cfg.linksPath, links);
      });
    },
    async unlinkOidc(userId: string, providerKey: string, issuer: string, sub: string): Promise<void> {
      return withLock("links", async () => {
        const users = await rUsers();
        const u = users.users[userId];
        if (u) {
          u.linkedIdentities = u.linkedIdentities.filter(
            (x) => !(x.providerKey === providerKey && x.issuer === issuer && x.sub === sub),
          );
          u.updatedAt = new Date().toISOString();
          await writeJsonAtomic(cfg.usersPath, users);
        }
        const links = await rLinks();
        delete links.links[lk(providerKey, issuer, sub)];
        await writeJsonAtomic(cfg.linksPath, links);
      });
    },
    async findUserByOidc(providerKey: string, issuer: string, sub: string): Promise<AuthUser | null> {
      const links = await rLinks();
      const userId = links.links[lk(providerKey, issuer, sub)];
      if (!userId) return null;
      return this.getUser(userId);
    },
    async bootstrapCompletedAt(): Promise<string | null> {
      return (await rBoot()).completedAt ?? null;
    },
    async markBootstrapComplete(userId: string): Promise<void> {
      const f = await rBoot();
      f.completedAt = new Date().toISOString();
      f.completedByUserId = userId;
      await writeJsonAtomic(cfg.bootstrapPath, f);
    },
  };
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="auth-store"
git add apps/bridge/src/services/auth/store.ts apps/bridge/test/auth-store.test.ts
git commit -m "feat(bridge): file-backed auth store (users/roles/oidc-links/bootstrap, keyed maps)"
```

### Task 1.11: Actor-assertion (HMAC) sign/verify

**Files:**
- Create: `apps/bridge/src/services/auth/assertion.ts`
- Test:   `apps/bridge/test/auth-assertion.test.ts`

- [ ] **Test** — round-trip, bad secret, tampered payload, expired, malformed.

```typescript
// apps/bridge/test/auth-assertion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { signAssertion, verifyAssertion } from "../src/services/auth/assertion.js";
const S = "x".repeat(32);

test("sign then verify", () => {
  const t = signAssertion(S, { sub: "u1", sid: "s1", ttlMs: 60_000 });
  const c = verifyAssertion(S, t, { clockSkewMs: 1_000 });
  assert.equal(c!.sub, "u1");
  assert.equal(c!.sid, "s1");
});
test("bad secret", () => {
  const t = signAssertion(S, { sub: "u", sid: "s", ttlMs: 60_000 });
  assert.equal(verifyAssertion("y".repeat(32), t, { clockSkewMs: 1_000 }), null);
});
test("tampered payload", () => {
  const t = signAssertion(S, { sub: "u", sid: "s", ttlMs: 60_000 });
  const [p, sig] = t.split(".");
  const decoded = Buffer.from(p, "base64url").toString("utf8").replace('"u"', '"atk"');
  const tam = Buffer.from(decoded, "utf8").toString("base64url");
  assert.equal(verifyAssertion(S, `${tam}.${sig}`, { clockSkewMs: 1_000 }), null);
});
test("expired", () => {
  const t = signAssertion(S, { sub: "u", sid: "s", ttlMs: -10_000 });
  assert.equal(verifyAssertion(S, t, { clockSkewMs: 0 }), null);
});
test("malformed", () => {
  assert.equal(verifyAssertion(S, "garbage", { clockSkewMs: 0 }), null);
  assert.equal(verifyAssertion(S, "a.b.c", { clockSkewMs: 0 }), null);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/assertion.ts
import crypto from "node:crypto";

export type AssertionClaims = {
  sub: string; sid: string; iat: number; exp: number; username?: string;
};
export type SignInput = { sub: string; sid: string; ttlMs: number; username?: string };

function b64(buf: Buffer): string { return buf.toString("base64url"); }
function unb64(s: string): Buffer { return Buffer.from(s, "base64url"); }

export function signAssertion(secret: string, input: SignInput): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AssertionClaims = {
    sub: input.sub, sid: input.sid, iat: now,
    exp: now + Math.floor(input.ttlMs / 1000),
    username: input.username,
  };
  const payload = b64(Buffer.from(JSON.stringify(claims), "utf8"));
  const mac = crypto.createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64(mac)}`;
}

export function verifyAssertion(secret: string, token: string, opts: { clockSkewMs: number }): AssertionClaims | null {
  const dot = token.indexOf(".");
  if (dot < 0 || token.indexOf(".", dot + 1) >= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try { actual = unb64(sig); } catch { return null; }
  if (actual.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(actual, expected)) return null;
  let claims: AssertionClaims;
  try { claims = JSON.parse(unb64(payload).toString("utf8")) as AssertionClaims; } catch { return null; }
  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") return null;
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;
  const nowSec = Math.floor((Date.now() - opts.clockSkewMs) / 1000);
  if (claims.exp < nowSec) return null;
  return claims;
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="assertion"
git add apps/bridge/src/services/auth/assertion.ts apps/bridge/test/auth-assertion.test.ts
git commit -m "feat(bridge): HMAC-SHA256 actor-assertion sign/verify"
```

### Task 1.12: Audit log

**Files:**
- Create: `apps/bridge/src/services/auth/audit.ts`
- Test:   `apps/bridge/test/auth-audit.test.ts`

- [ ] **Test**

```typescript
// apps/bridge/test/auth-audit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuditLog } from "../src/services/auth/audit.js";

async function mk() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-"));
  return createAuditLog({ path: path.join(dir, "audit.jsonl") });
}

test("append + tail", async () => {
  const log = await mk();
  await log.append({ kind: "login.success", actorUsername: "alice" });
  const e = await log.tail(10);
  assert.equal(e[0].kind, "login.success");
  assert.ok(e[0].at);
});
test("tail newest first with limit", async () => {
  const log = await mk();
  for (let i = 0; i < 5; i++) {
    await log.append({ kind: "login.success", meta: { i } });
    await new Promise((r) => setTimeout(r, 1));
  }
  const t = await log.tail(3);
  assert.equal(t.length, 3);
  assert.equal(t[0].meta!.i, 4);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/audit.ts
import fs from "node:fs/promises";
import type { AuthAuditEntry } from "@openclaw-manager/types";
import { appendJsonl } from "../atomic-file.js";

export type AuditLogConfig = { path: string };

export function createAuditLog(cfg: AuditLogConfig) {
  return {
    async append(entry: Omit<AuthAuditEntry, "at">): Promise<void> {
      await appendJsonl(cfg.path, { ...entry, at: new Date().toISOString() });
    },
    async tail(limit: number): Promise<AuthAuditEntry[]> {
      let raw = "";
      try { raw = await fs.readFile(cfg.path, "utf8"); } catch { return []; }
      const out: AuthAuditEntry[] = [];
      for (const l of raw.split("\n")) {
        const t = l.trim();
        if (!t) continue;
        try { out.push(JSON.parse(t)); } catch {}
      }
      out.reverse();
      return out.slice(0, limit);
    },
  };
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="audit"
git add apps/bridge/src/services/auth/audit.ts apps/bridge/test/auth-audit.test.ts
git commit -m "feat(bridge): append-only JSONL auth audit log"
```

### Task 1.13: WS ticket store

**Files:**
- Create: `apps/bridge/src/services/auth/ws-ticket.ts`
- Test:   `apps/bridge/test/auth-ws-ticket.test.ts`

- [ ] **Test**

```typescript
// apps/bridge/test/auth-ws-ticket.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWsTicketStore } from "../src/services/auth/ws-ticket.js";

test("issue + single-use consume", () => {
  const s = createWsTicketStore({ ttlMs: 60_000 });
  const t = s.issue({ userId: "u", sessionId: "sid" });
  assert.equal(s.consume(t.ticket)?.userId, "u");
  assert.equal(s.consume(t.ticket), null);
});
test("expired ticket can't be consumed", () => {
  const s = createWsTicketStore({ ttlMs: -1_000 });
  const t = s.issue({ userId: "u", sessionId: "sid" });
  assert.equal(s.consume(t.ticket), null);
});
test("unknown ticket returns null", () => {
  const s = createWsTicketStore({ ttlMs: 60_000 });
  assert.equal(s.consume("nope"), null);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/ws-ticket.ts
import crypto from "node:crypto";

export type WsTicketClaim = { userId: string; sessionId: string };
type StoredTicket = WsTicketClaim & { expiresAt: number };

export function createWsTicketStore(cfg: { ttlMs: number }) {
  const tickets = new Map<string, StoredTicket>();
  function sweep(): void {
    const now = Date.now();
    for (const [k, v] of tickets) if (v.expiresAt <= now) tickets.delete(k);
  }
  return {
    issue(claim: WsTicketClaim): { ticket: string; expiresAt: string } {
      sweep();
      const ticket = crypto.randomBytes(24).toString("base64url");
      const expiresAt = Date.now() + cfg.ttlMs;
      tickets.set(ticket, { ...claim, expiresAt });
      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },
    consume(ticket: string): WsTicketClaim | null {
      sweep();
      const row = tickets.get(ticket);
      if (!row) return null;
      tickets.delete(ticket);
      if (row.expiresAt <= Date.now()) return null;
      return { userId: row.userId, sessionId: row.sessionId };
    },
  };
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="ws-ticket"
git add apps/bridge/src/services/auth/ws-ticket.ts apps/bridge/test/auth-ws-ticket.test.ts
git commit -m "feat(bridge): single-use WebSocket ticket store (60s default TTL)"
```

### Task 1.14: High-level auth service

**Files:**
- Create: `apps/bridge/src/services/auth/service.ts`
- Test:   `apps/bridge/test/auth-service.test.ts`

- [ ] **Test** — cover: unknown user login fails, correct password succeeds, disabled user fails, resolveSession returns permissions, logout revokes, disabling user invalidates existing session, change password requires old password, admin reset password works, bootstrap creates first admin + blocks re-run + rejects wrong token, legacy migration creates admin only when users empty + blocks re-run.

```typescript
// apps/bridge/test/auth-service.test.ts — see full test file above in plan's source
// 13 tests total; include all of them.
```

See full test body in **Task 1.14 test file** (copy verbatim from below).

<details>
<summary>Full test body (click to expand)</summary>

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuthService } from "../src/services/auth/service.js";

async function mk() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-svc-"));
  return createAuthService({
    usersPath: path.join(dir, "users.json"),
    rolesPath: path.join(dir, "roles.json"),
    linksPath: path.join(dir, "oidc-links.json"),
    bootstrapPath: path.join(dir, "bootstrap.json"),
    sessionsDir: path.join(dir, "sessions"),
    auditPath: path.join(dir, "audit.jsonl"),
    sessionTtlMs: 60_000, lastSeenThrottleMs: 0, wsTicketTtlMs: 60_000,
  });
}

test("login: unknown user fails", async () => {
  const svc = await mk();
  const r = await svc.login({ username: "nobody", password: "x" });
  assert.equal(r.ok, false);
});
test("login: correct password succeeds", async () => {
  const svc = await mk();
  await svc.ensureSystemRoles();
  const u = await svc.adminCreateUser({ username: "alice", password: "pw12345678", roleIds: ["admin"] }, "system");
  const r = await svc.login({ username: "alice", password: "pw12345678" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.user.id, u.id);
});
test("login: disabled user fails", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "bob", password: "pw12345678" }, "system");
  await svc.adminUpdateUser(u.id, { status: "disabled" }, "system");
  assert.equal((await svc.login({ username: "bob", password: "pw12345678" })).ok, false);
});
test("resolveSession returns user + permissions", async () => {
  const svc = await mk();
  await svc.ensureSystemRoles();
  const u = await svc.adminCreateUser({ username: "c", password: "pw12345678", roleIds: ["viewer"] }, "system");
  const login = await svc.login({ username: "c", password: "pw12345678" });
  if (!login.ok) throw new Error("login failed");
  const r = await svc.resolveSession({ sid: login.sessionId });
  assert.ok(r);
  assert.equal(r!.user.id, u.id);
  assert.ok(r!.permissions.includes("overview.view"));
  assert.ok(!r!.permissions.includes("auth.users.write"));
});
test("resolveSession null for unknown sid", async () => {
  const svc = await mk();
  assert.equal(await svc.resolveSession({ sid: "nope" }), null);
});
test("logout revokes session", async () => {
  const svc = await mk();
  await svc.adminCreateUser({ username: "d", password: "pw12345678" }, "system");
  const login = await svc.login({ username: "d", password: "pw12345678" });
  if (!login.ok) throw new Error();
  await svc.logout(login.sessionId);
  assert.equal(await svc.resolveSession({ sid: login.sessionId }), null);
});
test("disabling user invalidates existing session", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "e", password: "pw12345678" }, "system");
  const login = await svc.login({ username: "e", password: "pw12345678" });
  if (!login.ok) throw new Error();
  await svc.adminUpdateUser(u.id, { status: "disabled" }, "system");
  assert.equal(await svc.resolveSession({ sid: login.sessionId }), null);
});
test("changePassword requires old password", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "f", password: "pw12345678" }, "system");
  await assert.rejects(
    () => svc.changePassword(u.id, { oldPassword: "wrong", newPassword: "newpw1234" }),
    /incorrect/,
  );
  await svc.changePassword(u.id, { oldPassword: "pw12345678", newPassword: "newpw1234" });
  assert.equal((await svc.login({ username: "f", password: "newpw1234" })).ok, true);
});
test("adminResetPassword sets new password + revokes sessions", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "g", password: "pw12345678" }, "system");
  const login = await svc.login({ username: "g", password: "pw12345678" });
  if (!login.ok) throw new Error();
  await svc.adminResetPassword(u.id, "freshpw1234", "system");
  assert.equal(await svc.resolveSession({ sid: login.sessionId }), null);
  assert.equal((await svc.login({ username: "g", password: "freshpw1234" })).ok, true);
});
test("bootstrap: creates first admin", async () => {
  const svc = await mk();
  const r = await svc.bootstrap({ token: "tok", username: "root", password: "bootpass12" }, { token: "tok" });
  assert.equal(r.ok, true);
});
test("bootstrap: rejects second run", async () => {
  const svc = await mk();
  await svc.bootstrap({ token: "tok", username: "root", password: "bootpass12" }, { token: "tok" });
  const r2 = await svc.bootstrap({ token: "tok", username: "other", password: "bootpass12" }, { token: "tok" });
  assert.equal(r2.ok, false);
});
test("bootstrap: rejects wrong token", async () => {
  const svc = await mk();
  const r = await svc.bootstrap({ token: "bad", username: "x", password: "bootpass12" }, { token: "tok" });
  assert.equal(r.ok, false);
});
test("legacy migration: accepts ADMIN_PASSWORD when no users, blocked after", async () => {
  const svc = await mk();
  const r = await svc.loginLegacy({ password: "legacy" }, { legacyPassword: "legacy" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.user.username, "admin");
  const r2 = await svc.loginLegacy({ password: "legacy" }, { legacyPassword: "legacy" });
  assert.equal(r2.ok, false);
});
```

</details>

- [ ] **Implement** — see full source in plan notes file below. System roles default grants defined in the `SYSTEM_ROLES` constant per the registry.

```typescript
// apps/bridge/src/services/auth/service.ts
import crypto from "node:crypto";
import type {
  AuthUser, AuthUserPublic, AuthUserCreateInput, AuthUserUpdateInput,
  AuthRoleCreateInput, AuthRoleUpdateInput, AuthRole, AuthSession,
  PermissionId, WsTicketResponse,
} from "@openclaw-manager/types";
import { ALL_PERMISSION_IDS } from "@openclaw-manager/types";
import { createAuthStore } from "./store.js";
import { createSessionStore, type SessionStore } from "./session-store.js";
import { createAuditLog } from "./audit.js";
import { createWsTicketStore } from "./ws-ticket.js";
import { hashPassword, verifyPassword } from "./hash.js";
import { evaluateEffective } from "./permissions.js";

export type AuthServiceConfig = {
  usersPath: string; rolesPath: string; linksPath: string; bootstrapPath: string;
  sessionsDir: string; auditPath: string;
  sessionTtlMs: number; lastSeenThrottleMs: number; wsTicketTtlMs: number;
};

export type LoginInput = { username: string; password: string; userAgent?: string; ip?: string };
export type LoginResult =
  | { ok: true; sessionId: string; expiresAt: string; user: AuthUserPublic; permissions: PermissionId[] }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "unknown" };

export type ResolveResult = {
  user: AuthUserPublic; permissions: PermissionId[];
  session: { id: string; expiresAt: string };
};

export type BootstrapResult =
  | { ok: true; user: AuthUserPublic }
  | { ok: false; reason: "already_completed" | "invalid_token" | "invalid_input" };

export const SYSTEM_ROLES = {
  admin: { name: "Admin", description: "Full access", grants: ALL_PERMISSION_IDS },
  "auth-admin": {
    name: "Auth Admin", description: "Manage users/roles/providers/audit/sessions",
    grants: [
      "auth.users.read","auth.users.write",
      "auth.roles.read","auth.roles.write",
      "auth.providers.read","auth.providers.write",
      "auth.sessions.read","auth.sessions.revoke",
      "auth.audit.read",
    ] as PermissionId[],
  },
  operator: {
    name: "Operator", description: "Day-to-day operations",
    grants: [
      "overview.view",
      "conversations.view","conversations.takeover","conversations.release",
      "conversations.wake","conversations.send",
      "claude_code.view","claude_code.resolve_pending","claude_code.change_mode",
      "claude_code.summarize","claude_code.rename",
      "reviews.view","reviews.triage","reviews.run_now",
      "agents.view",
      "agent_sessions.view","agent_sessions.create","agent_sessions.send",
      "agent_sessions.reset","agent_sessions.abort","agent_sessions.compact",
      "youtube.view","youtube.submit","youtube.chat","youtube.rebuild","youtube.rerun",
      "cron.view","cron.run",
      "channels.view",
      "tools.view",
      "routing.view","relay.view",
      "brain.people.read","brain.people.write",
      "brain.global.read",
      "capabilities.view",
      "settings.read",
      "logs.read","telemetry.read",
    ] as PermissionId[],
  },
  viewer: {
    name: "Viewer", description: "Read-only",
    grants: [
      "overview.view","conversations.view","claude_code.view","reviews.view",
      "agents.view","agent_sessions.view","youtube.view","cron.view","channels.view",
      "tools.view","routing.view","relay.view",
      "brain.people.read","brain.global.read",
      "capabilities.view","settings.read","logs.read","telemetry.read",
    ] as PermissionId[],
  },
};

function toPublic(u: AuthUser): AuthUserPublic {
  const { local, usernameKey: _k, ...rest } = u;
  return { ...rest, hasLocalPassword: !!local?.passwordHash };
}

export async function createAuthService(cfg: AuthServiceConfig) {
  const store = createAuthStore({
    usersPath: cfg.usersPath, rolesPath: cfg.rolesPath,
    linksPath: cfg.linksPath, bootstrapPath: cfg.bootstrapPath,
  });
  const sessions: SessionStore = createSessionStore({
    dir: cfg.sessionsDir, ttlMs: cfg.sessionTtlMs, lastSeenThrottleMs: cfg.lastSeenThrottleMs,
  });
  const audit = createAuditLog({ path: cfg.auditPath });
  const wsTickets = createWsTicketStore({ ttlMs: cfg.wsTicketTtlMs });

  async function effectivePermissions(user: AuthUser): Promise<PermissionId[]> {
    return evaluateEffective(user, await store.listRoles());
  }

  async function issueSession(user: AuthUser, origin: "local" | "oidc", ctx: { userAgent?: string; ip?: string }) {
    const session = await sessions.create({ userId: user.id, origin, userAgent: ctx.userAgent, ip: ctx.ip });
    await store.recordLogin(user.id);
    const permissions = await effectivePermissions(user);
    return { session, permissions };
  }

  return {
    store, sessions, audit, wsTickets,
    async ensureSystemRoles(): Promise<void> {
      for (const [id, def] of Object.entries(SYSTEM_ROLES)) {
        await store.upsertSystemRole(id, def);
      }
    },
    async isEmpty(): Promise<boolean> { return store.isEmpty(); },
    async listUsers(): Promise<AuthUserPublic[]> { return (await store.listUsers()).map(toPublic); },
    async getUserPublic(id: string): Promise<AuthUserPublic | null> {
      const u = await store.getUser(id);
      return u ? toPublic(u) : null;
    },
    async adminCreateUser(input: AuthUserCreateInput, actor: string): Promise<AuthUserPublic> {
      const { password, ...rest } = input;
      const u = await store.createUser(rest);
      if (password) await store.setLocalPassword(u.id, await hashPassword(password));
      await audit.append({ kind: "user.created", actorUsername: actor, targetUserId: u.id, targetUsername: u.username });
      return toPublic((await store.getUser(u.id))!);
    },
    async adminUpdateUser(id: string, patch: AuthUserUpdateInput, actor: string): Promise<AuthUserPublic> {
      const before = await store.getUser(id);
      const after = await store.updateUser(id, patch);
      if (before && before.status === "active" && after.status === "disabled") {
        const revoked = await sessions.revokeAllForUser(id);
        await audit.append({
          kind: "user.disabled", actorUsername: actor,
          targetUserId: id, targetUsername: after.username,
          meta: { revokedSessions: revoked },
        });
      } else if (before && before.status === "disabled" && after.status === "active") {
        await audit.append({ kind: "user.enabled", actorUsername: actor, targetUserId: id, targetUsername: after.username });
      } else {
        await audit.append({ kind: "user.updated", actorUsername: actor, targetUserId: id, targetUsername: after.username });
      }
      return toPublic(after);
    },
    async adminDeleteUser(id: string, actor: string): Promise<void> {
      const u = await store.getUser(id);
      if (!u) return;
      await sessions.revokeAllForUser(id);
      await store.deleteUser(id);
      await audit.append({ kind: "user.deleted", actorUsername: actor, targetUserId: id, targetUsername: u.username });
    },
    async adminResetPassword(userId: string, newPassword: string, actor: string): Promise<void> {
      if (newPassword.length < 8) throw new Error("password too short");
      await store.setLocalPassword(userId, await hashPassword(newPassword));
      await sessions.revokeAllForUser(userId);
      const u = await store.getUser(userId);
      await audit.append({ kind: "user.password_reset", actorUsername: actor, targetUserId: userId, targetUsername: u?.username });
    },
    async changePassword(userId: string, input: { oldPassword: string; newPassword: string }): Promise<void> {
      if (input.newPassword.length < 8) throw new Error("password too short");
      const u = await store.getUser(userId);
      if (!u?.local?.passwordHash) throw new Error("no local password set");
      if (!(await verifyPassword(input.oldPassword, u.local.passwordHash))) throw new Error("old password incorrect");
      await store.setLocalPassword(userId, await hashPassword(input.newPassword));
      await audit.append({
        kind: "user.password_changed", actorUserId: userId, actorUsername: u.username,
        targetUserId: userId, targetUsername: u.username,
      });
    },
    async login(input: LoginInput): Promise<LoginResult> {
      const user = await store.findByUsername(input.username);
      const fail = { ok: false as const, reason: "invalid_credentials" as const };
      if (!user || !user.local?.passwordHash) {
        await audit.append({ kind: "login.failure", actorUsername: input.username, ip: input.ip, userAgent: input.userAgent });
        return fail;
      }
      if (!(await verifyPassword(input.password, user.local.passwordHash))) {
        await audit.append({ kind: "login.failure", actorUsername: input.username, ip: input.ip, userAgent: input.userAgent });
        return fail;
      }
      if (user.status !== "active") {
        await audit.append({ kind: "login.disabled", actorUserId: user.id, actorUsername: user.username, ip: input.ip, userAgent: input.userAgent });
        return { ok: false, reason: "disabled" };
      }
      const { session, permissions } = await issueSession(user, "local", input);
      await audit.append({
        kind: "login.success", actorUserId: user.id, actorUsername: user.username,
        sessionId: session.id, ip: input.ip, userAgent: input.userAgent,
      });
      return { ok: true, sessionId: session.id, expiresAt: session.expiresAt, user: toPublic(user), permissions };
    },
    async loginLegacy(input: { password: string; ip?: string; userAgent?: string }, ctx: { legacyPassword: string }): Promise<LoginResult> {
      if (!ctx.legacyPassword) return { ok: false, reason: "unknown" };
      if (!(await store.isEmpty())) return { ok: false, reason: "unknown" };
      const a = Buffer.from(input.password), b = Buffer.from(ctx.legacyPassword);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid_credentials" };
      await this.ensureSystemRoles();
      const hash = await hashPassword(input.password);
      const created = await store.createUser({ username: "admin", displayName: "Admin (legacy)", roleIds: ["admin"] });
      await store.setLocalPassword(created.id, hash);
      await store.markBootstrapComplete(created.id);
      await audit.append({ kind: "bootstrap.legacy_migration", actorUsername: "admin", targetUserId: created.id, targetUsername: created.username });
      const user = (await store.getUser(created.id))!;
      const { session, permissions } = await issueSession(user, "local", input);
      return { ok: true, sessionId: session.id, expiresAt: session.expiresAt, user: toPublic(user), permissions };
    },
    async bootstrap(input: { token: string; username: string; password: string }, ctx: { token: string }): Promise<BootstrapResult> {
      if (!ctx.token) return { ok: false, reason: "invalid_token" };
      if ((await store.bootstrapCompletedAt()) || !(await store.isEmpty())) return { ok: false, reason: "already_completed" };
      const a = Buffer.from(input.token), b = Buffer.from(ctx.token);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid_token" };
      if (!input.username || input.password.length < 8) return { ok: false, reason: "invalid_input" };
      await this.ensureSystemRoles();
      const u = await this.adminCreateUser({ username: input.username, password: input.password, roleIds: ["admin"] }, "bootstrap");
      await store.markBootstrapComplete(u.id);
      await audit.append({ kind: "bootstrap.success", actorUsername: "bootstrap", targetUserId: u.id, targetUsername: u.username });
      return { ok: true, user: u };
    },
    async logout(sid: string): Promise<void> {
      const sess = await sessions.get(sid);
      await sessions.revoke(sid);
      if (sess) {
        const u = await store.getUser(sess.userId);
        await audit.append({ kind: "logout", actorUserId: sess.userId, actorUsername: u?.username, sessionId: sid });
      }
    },
    async resolveSession(input: { sid: string; ip?: string; userAgent?: string }): Promise<ResolveResult | null> {
      const sess = await sessions.touch(input.sid);
      if (!sess) return null;
      const user = await store.getUser(sess.userId);
      if (!user || user.status !== "active") return null;
      const permissions = await effectivePermissions(user);
      return { user: toPublic(user), permissions, session: { id: sess.id, expiresAt: sess.expiresAt } };
    },
    async issueWsTicket(userId: string, sessionId: string): Promise<WsTicketResponse> {
      return wsTickets.issue({ userId, sessionId });
    },
    async consumeWsTicket(ticket: string): Promise<{ userId: string; sessionId: string } | null> {
      return wsTickets.consume(ticket);
    },
    async listSessionsForUser(userId: string): Promise<AuthSession[]> { return sessions.listForUser(userId); },
    async revokeSession(sid: string, actor: string): Promise<void> {
      const sess = await sessions.get(sid);
      await sessions.revoke(sid);
      if (sess) {
        const u = await store.getUser(sess.userId);
        await audit.append({ kind: "session.revoked", actorUsername: actor, targetUserId: sess.userId, targetUsername: u?.username, sessionId: sid });
      }
    },
    async createRole(input: AuthRoleCreateInput, actor: string): Promise<AuthRole> {
      const r = await store.createRole(input);
      await audit.append({ kind: "role.created", actorUsername: actor, meta: { roleId: r.id, name: r.name } });
      return r;
    },
    async updateRole(id: string, patch: AuthRoleUpdateInput, actor: string): Promise<AuthRole> {
      const r = await store.updateRole(id, patch);
      await audit.append({ kind: "role.updated", actorUsername: actor, meta: { roleId: id } });
      return r;
    },
    async deleteRole(id: string, actor: string): Promise<void> {
      await store.deleteRole(id);
      await audit.append({ kind: "role.deleted", actorUsername: actor, meta: { roleId: id } });
    },
  };
}

export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
```

- [ ] **Run tests + commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="auth-svc|auth-service"
git add apps/bridge/src/services/auth/service.ts apps/bridge/test/auth-service.test.ts
git commit -m "feat(bridge): high-level auth service (login, sessions, bootstrap, legacy migration, roles, audit)"
```

### Task 1.15: OIDC helpers + discovery wrapper

**Files:**
- Modify: `apps/bridge/package.json` (add `openid-client@^6`)
- Create: `apps/bridge/src/services/auth/oidc.ts`
- Test:   `apps/bridge/test/auth-oidc.test.ts`

- [ ] **Add dep**

```bash
cd apps/bridge && pnpm add openid-client@^6
```

- [ ] **Test (pure helpers only; no network)**

```typescript
// apps/bridge/test/auth-oidc.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthRequest, parseCallback } from "../src/services/auth/oidc.js";

test("buildAuthRequest produces URL with state/nonce/PKCE", () => {
  const req = buildAuthRequest({
    issuerUrl: "https://iss", clientId: "cid",
    redirectUri: "https://dash/cb", scopes: ["openid","email"],
    authorizationEndpoint: "https://iss/authorize",
  });
  assert.ok(req.url.includes("client_id=cid"));
  assert.ok(req.url.includes("code_challenge="));
  assert.ok(req.state);
  assert.ok(req.nonce);
  assert.ok(req.codeVerifier);
});
test("parseCallback returns code+state", () => {
  const r = parseCallback("https://dash/cb?code=abc&state=xyz");
  assert.equal(r?.code, "abc");
  assert.equal(r?.state, "xyz");
});
test("parseCallback rejects error param", () => {
  assert.equal(parseCallback("https://dash/cb?error=denied"), null);
});
```

- [ ] **Implement**

```typescript
// apps/bridge/src/services/auth/oidc.ts
import crypto from "node:crypto";
import * as oidc from "openid-client";
import type { OidcProviderConfig } from "@openclaw-manager/types";

export type AuthRequestInput = {
  issuerUrl: string; clientId: string; redirectUri: string;
  scopes: string[]; authorizationEndpoint: string;
};
export type AuthRequest = { url: string; state: string; nonce: string; codeVerifier: string };

function b64url(b: Buffer): string { return b.toString("base64url"); }
function rnd(): string { return b64url(crypto.randomBytes(32)); }

export function buildAuthRequest(input: AuthRequestInput): AuthRequest {
  const state = rnd();
  const nonce = rnd();
  const codeVerifier = rnd();
  const challenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, nonce, codeVerifier };
}

export type CallbackParams = { code: string; state: string };
export function parseCallback(fullUrl: string): CallbackParams | null {
  const u = new URL(fullUrl);
  if (u.searchParams.get("error")) return null;
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (!code || !state) return null;
  return { code, state };
}

export type OidcClientContext = { config: oidc.Configuration; provider: OidcProviderConfig };

export async function discoverClient(provider: OidcProviderConfig): Promise<OidcClientContext> {
  const config = await oidc.discovery(new URL(provider.issuerUrl), provider.clientId, provider.clientSecret);
  return { config, provider };
}

export type OidcIdentity = {
  issuer: string; sub: string; email?: string; name?: string; emailVerified?: boolean;
};

export async function exchangeAndClaims(
  ctx: OidcClientContext,
  input: { currentUrl: URL; state: string; nonce: string; codeVerifier: string },
): Promise<OidcIdentity> {
  const tokens = await oidc.authorizationCodeGrant(ctx.config, input.currentUrl, {
    expectedState: input.state, expectedNonce: input.nonce, pkceCodeVerifier: input.codeVerifier,
  });
  const claims = tokens.claims();
  if (!claims || !claims.sub) throw new Error("missing sub");
  return {
    issuer: String(claims.iss ?? ctx.provider.issuerUrl),
    sub: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
    emailVerified: typeof claims.email_verified === "boolean" ? claims.email_verified : undefined,
  };
}
```

- [ ] **Commit**

```bash
cd apps/bridge && pnpm test -- --test-name-pattern="oidc"
git add apps/bridge/package.json apps/bridge/src/services/auth/oidc.ts apps/bridge/test/auth-oidc.test.ts ../../pnpm-lock.yaml
git commit -m "feat(bridge): openid-client auth-code+PKCE helpers"
```

### Task 1.16: Auth middleware + routes + server wiring

**Files:**
- Create: `apps/bridge/src/auth-middleware.ts`
- Create: `apps/bridge/src/routes/auth.ts`
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/ws.ts` (accept ticket OR bearer; bearer path removed in P6)
- Test:   `apps/bridge/test/auth-routes.test.ts`

- [ ] **Middleware**

```typescript
// apps/bridge/src/auth-middleware.ts
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { verifyAssertion, type AssertionClaims } from "./services/auth/assertion.js";
import type { AuthService } from "./services/auth/service.js";
import type { AuthUserPublic, PermissionId } from "@openclaw-manager/types";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      claims: AssertionClaims;
      user: AuthUserPublic;
      permissions: PermissionId[];
    };
  }
}

export type ActorAssertionOpts = { strict: boolean };

export function actorAssertionAuth(svc: AuthService, opts: ActorAssertionOpts = { strict: true }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers["x-ocm-actor"];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      if (opts.strict) { res.status(401).json({ error: "missing_actor_assertion" }); return; }
      next();
      return;
    }
    const claims = verifyAssertion(config.authAssertionSecret, token, { clockSkewMs: 30_000 });
    if (!claims) { res.status(401).json({ error: "invalid_actor_assertion" }); return; }
    const resolved = await svc.resolveSession({ sid: claims.sid });
    if (!resolved || resolved.user.id !== claims.sub) {
      res.status(401).json({ error: "stale_session" });
      return;
    }
    req.auth = { claims, user: resolved.user, permissions: resolved.permissions };
    next();
  };
}

export function requirePerm(...perms: PermissionId[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = req.auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) {
        res.status(403).json({ error: "forbidden", missing: p });
        return;
      }
    }
    next();
  };
}
```

- [ ] **Routes** — public endpoints (login/bootstrap/resolve/oidc) require only service bearer; authenticated endpoints require actor assertion too.

```typescript
// apps/bridge/src/routes/auth.ts
import express, { type Router } from "express";
import { config } from "../config.js";
import type { AuthService } from "../services/auth/service.js";
import { requirePerm } from "../auth-middleware.js";
import { buildAuthRequest, discoverClient, exchangeAndClaims, parseCallback } from "../services/auth/oidc.js";
import type { OidcProviderConfig } from "@openclaw-manager/types";

const oidcStates = new Map<string, { nonce: string; codeVerifier: string; returnTo?: string; expiresAt: number }>();
function cleanOidc(): void {
  const now = Date.now();
  for (const [k, v] of oidcStates) if (v.expiresAt <= now) oidcStates.delete(k);
}
function oidcProvider(): OidcProviderConfig | null {
  if (!config.oidcIssuerUrl || !config.oidcClientId || !config.oidcClientSecret || !config.oidcRedirectUri) return null;
  return {
    key: config.oidcProviderKey, displayName: config.oidcProviderName,
    issuerUrl: config.oidcIssuerUrl, clientId: config.oidcClientId,
    clientSecret: config.oidcClientSecret, redirectUri: config.oidcRedirectUri,
    scopes: config.oidcScopes, autoProvision: config.oidcAutoProvision,
  };
}

export function createPublicAuthRouter(svc: AuthService): Router {
  const r = express.Router();

  r.post("/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "username and password required" });
      return;
    }
    const result = await svc.login({
      username, password,
      userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip,
    });
    if (!result.ok) { res.status(401).json({ error: "invalid_credentials" }); return; }
    res.json({
      sessionId: result.sessionId, expiresAt: result.expiresAt,
      user: result.user, permissions: result.permissions,
    });
  });

  r.post("/auth/login-legacy", async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string") { res.status(400).json({ error: "password required" }); return; }
    const result = await svc.loginLegacy(
      { password, userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip },
      { legacyPassword: config.authLegacyAdminPassword },
    );
    if (!result.ok) { res.status(401).json({ error: "not_available" }); return; }
    res.json({
      sessionId: result.sessionId, expiresAt: result.expiresAt,
      user: result.user, permissions: result.permissions,
    });
  });

  r.post("/auth/bootstrap", async (req, res) => {
    const { token, username, password } = req.body ?? {};
    if (typeof token !== "string" || typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "token, username, password required" });
      return;
    }
    const result = await svc.bootstrap({ token, username, password }, { token: config.authBootstrapToken });
    if (!result.ok) { res.status(403).json({ error: result.reason }); return; }
    res.json({ user: result.user });
  });

  r.post("/auth/session/resolve", async (req, res) => {
    const { sid } = req.body ?? {};
    if (typeof sid !== "string") { res.status(400).json({ error: "sid required" }); return; }
    const r2 = await svc.resolveSession({
      sid, userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip,
    });
    if (!r2) { res.status(401).json({ error: "invalid_session" }); return; }
    res.json(r2);
  });

  r.get("/auth/oidc/config", (_req, res) => {
    const p = oidcProvider();
    res.json({ enabled: !!p, displayName: p?.displayName });
  });

  r.post("/auth/oidc/start", async (req, res) => {
    cleanOidc();
    const p = oidcProvider();
    if (!p) { res.status(404).json({ error: "oidc_not_configured" }); return; }
    try {
      const ctx = await discoverClient(p);
      const meta: any = ctx.config.serverMetadata();
      const ar = buildAuthRequest({
        issuerUrl: p.issuerUrl, clientId: p.clientId,
        redirectUri: p.redirectUri, scopes: p.scopes,
        authorizationEndpoint: String(meta.authorization_endpoint),
      });
      oidcStates.set(ar.state, {
        nonce: ar.nonce, codeVerifier: ar.codeVerifier,
        returnTo: typeof req.body?.returnTo === "string" ? req.body.returnTo : undefined,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      res.json({ authorizationUrl: ar.url, state: ar.state });
    } catch (err) {
      res.status(500).json({ error: "oidc_discovery_failed", detail: String((err as Error).message) });
    }
  });

  r.post("/auth/oidc/callback", async (req, res) => {
    cleanOidc();
    const p = oidcProvider();
    if (!p) { res.status(404).json({ error: "oidc_not_configured" }); return; }
    const { url } = req.body ?? {};
    if (typeof url !== "string") { res.status(400).json({ error: "url required" }); return; }
    const parsed = parseCallback(url);
    if (!parsed) { res.status(400).json({ error: "invalid_callback" }); return; }
    const state = oidcStates.get(parsed.state);
    if (!state) { res.status(400).json({ error: "invalid_state" }); return; }
    oidcStates.delete(parsed.state);
    try {
      const ctx = await discoverClient(p);
      const id = await exchangeAndClaims(ctx, {
        currentUrl: new URL(url), state: parsed.state,
        nonce: state.nonce, codeVerifier: state.codeVerifier,
      });
      let user = await svc.store.findUserByOidc(p.key, id.issuer, id.sub);
      if (!user && p.autoProvision) {
        const created = await svc.adminCreateUser(
          { username: id.email || `oidc-${id.sub.slice(0, 8)}`, displayName: id.name, email: id.email },
          "oidc-provision",
        );
        await svc.store.linkOidc(created.id, {
          providerKey: p.key, issuer: id.issuer, sub: id.sub, email: id.email, displayName: id.name,
        });
        user = await svc.store.getUser(created.id);
      }
      if (!user) {
        await svc.audit.append({
          kind: "oidc.login.unlinked",
          meta: { issuer: id.issuer, sub: id.sub, email: id.email ?? "" },
        });
        res.status(401).json({ kind: "unlinked", issuer: id.issuer, sub: id.sub, email: id.email });
        return;
      }
      if (user.status !== "active") { res.status(403).json({ error: "disabled" }); return; }
      const sess = await svc.sessions.create({
        userId: user.id, origin: "oidc",
        userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip,
      });
      await svc.store.recordLogin(user.id);
      await svc.audit.append({
        kind: "oidc.login.success", actorUserId: user.id, actorUsername: user.username,
        sessionId: sess.id,
      });
      res.json({ kind: "logged_in", sessionId: sess.id, expiresAt: sess.expiresAt, returnTo: state.returnTo });
    } catch (err) {
      res.status(400).json({ error: "oidc_exchange_failed", detail: String((err as Error).message) });
    }
  });

  return r;
}

export function createAuthRouter(svc: AuthService): Router {
  const r = express.Router();

  r.post("/auth/logout", async (req, res) => {
    await svc.logout(req.auth!.claims.sid);
    res.json({ ok: true });
  });
  r.get("/auth/me", (req, res) => {
    res.json({ user: req.auth!.user, permissions: req.auth!.permissions });
  });
  r.post("/auth/change-password", async (req, res) => {
    const { oldPassword, newPassword } = req.body ?? {};
    if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
      res.status(400).json({ error: "oldPassword and newPassword required" });
      return;
    }
    try { await svc.changePassword(req.auth!.user.id, { oldPassword, newPassword }); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
  r.post("/auth/ws-ticket", async (req, res) => {
    const t = await svc.issueWsTicket(req.auth!.user.id, req.auth!.claims.sid);
    res.json(t);
  });
  // Self-service: any authenticated user may link their own account.
  r.post("/auth/link-oidc/complete", async (req, res) => {
    const { providerKey, issuer, sub, email, displayName } = req.body ?? {};
    if (typeof providerKey !== "string" || typeof issuer !== "string" || typeof sub !== "string") {
      res.status(400).json({ error: "providerKey, issuer, sub required" });
      return;
    }
    await svc.store.linkOidc(req.auth!.user.id, { providerKey, issuer, sub, email, displayName });
    await svc.audit.append({ kind: "oidc.link.added", actorUsername: req.auth!.user.username, targetUserId: req.auth!.user.id });
    res.json({ ok: true });
  });

  // --- Admin: users ---
  r.get("/auth/users", requirePerm("auth.users.read"), async (_req, res) => { res.json({ users: await svc.listUsers() }); });
  r.post("/auth/users", requirePerm("auth.users.write"), async (req, res) => {
    res.json({ user: await svc.adminCreateUser(req.body ?? {}, req.auth!.user.username) });
  });
  r.get("/auth/users/:id", requirePerm("auth.users.read"), async (req, res) => {
    const u = await svc.getUserPublic(req.params.id);
    if (!u) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ user: u });
  });
  r.patch("/auth/users/:id", requirePerm("auth.users.write"), async (req, res) => {
    res.json({ user: await svc.adminUpdateUser(req.params.id, req.body ?? {}, req.auth!.user.username) });
  });
  r.delete("/auth/users/:id", requirePerm("auth.users.write"), async (req, res) => {
    if (req.params.id === req.auth!.user.id) { res.status(400).json({ error: "cannot_delete_self" }); return; }
    await svc.adminDeleteUser(req.params.id, req.auth!.user.username);
    res.json({ ok: true });
  });
  r.post("/auth/users/:id/reset-password", requirePerm("auth.users.write"), async (req, res) => {
    const { newPassword } = req.body ?? {};
    if (typeof newPassword !== "string") { res.status(400).json({ error: "newPassword required" }); return; }
    await svc.adminResetPassword(req.params.id, newPassword, req.auth!.user.username);
    res.json({ ok: true });
  });
  r.delete("/auth/users/:id/links/:providerKey/:issuer/:sub", requirePerm("auth.users.write"), async (req, res) => {
    await svc.store.unlinkOidc(req.params.id, req.params.providerKey,
      decodeURIComponent(req.params.issuer), req.params.sub);
    await svc.audit.append({ kind: "oidc.link.removed", actorUsername: req.auth!.user.username, targetUserId: req.params.id });
    res.json({ ok: true });
  });

  // --- Admin: roles ---
  r.get("/auth/roles", requirePerm("auth.roles.read"), async (_req, res) => { res.json({ roles: await svc.store.listRoles() }); });
  r.post("/auth/roles", requirePerm("auth.roles.write"), async (req, res) => {
    res.json({ role: await svc.createRole(req.body ?? {}, req.auth!.user.username) });
  });
  r.patch("/auth/roles/:id", requirePerm("auth.roles.write"), async (req, res) => {
    try { res.json({ role: await svc.updateRole(req.params.id, req.body ?? {}, req.auth!.user.username) }); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
  r.delete("/auth/roles/:id", requirePerm("auth.roles.write"), async (req, res) => {
    try { await svc.deleteRole(req.params.id, req.auth!.user.username); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });

  // --- Admin: sessions / audit / providers ---
  r.get("/auth/sessions", requirePerm("auth.sessions.read"), async (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : req.auth!.user.id;
    res.json({ sessions: await svc.listSessionsForUser(userId) });
  });
  r.delete("/auth/sessions/:sid", requirePerm("auth.sessions.revoke"), async (req, res) => {
    await svc.revokeSession(req.params.sid, req.auth!.user.username);
    res.json({ ok: true });
  });
  r.get("/auth/audit", requirePerm("auth.audit.read"), async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    res.json({ entries: await svc.audit.tail(limit) });
  });
  r.get("/auth/providers", requirePerm("auth.providers.read"), (_req, res) => {
    const p = oidcProvider();
    res.json({
      oidc: p ? {
        key: p.key, displayName: p.displayName, issuerUrl: p.issuerUrl,
        redirectUri: p.redirectUri, scopes: p.scopes, autoProvision: p.autoProvision,
      } : null,
    });
  });

  return r;
}
```

- [ ] **Routes test**

```typescript
// apps/bridge/test/auth-routes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
import { createAuthService } from "../src/services/auth/service.js";
import { createPublicAuthRouter } from "../src/routes/auth.js";

async function mkApp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ar-"));
  const svc = await createAuthService({
    usersPath: path.join(dir, "users.json"),
    rolesPath: path.join(dir, "roles.json"),
    linksPath: path.join(dir, "oidc-links.json"),
    bootstrapPath: path.join(dir, "bootstrap.json"),
    sessionsDir: path.join(dir, "sessions"),
    auditPath: path.join(dir, "audit.jsonl"),
    sessionTtlMs: 60_000, lastSeenThrottleMs: 0, wsTicketTtlMs: 60_000,
  });
  await svc.ensureSystemRoles();
  const app = express();
  app.use(express.json());
  app.use(createPublicAuthRouter(svc));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  return { svc, base: `http://127.0.0.1:${port}`, close() { server.close(); } };
}

test("POST /auth/login succeeds then /auth/session/resolve returns permissions", async () => {
  const { svc, base, close } = await mkApp();
  try {
    await svc.adminCreateUser({ username: "alice", password: "pw12345678", roleIds: ["viewer"] }, "system");
    const login = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "pw12345678" }),
    });
    assert.equal(login.status, 200);
    const { sessionId } = await login.json();
    const r = await fetch(`${base}/auth/session/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: sessionId }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.permissions.includes("overview.view"));
  } finally { close(); }
});
test("POST /auth/login rejects bad creds with 401", async () => {
  const { svc, base, close } = await mkApp();
  try {
    await svc.adminCreateUser({ username: "b", password: "pw12345678" }, "system");
    const res = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "b", password: "wrong" }),
    });
    assert.equal(res.status, 401);
  } finally { close(); }
});
```

- [ ] **Wire server.ts**

Replace `apps/bridge/src/server.ts` with:

```typescript
import express, { type Express } from "express";
import { config } from "./config.js";
import { bearerAuth } from "./auth.js";
import { actorAssertionAuth } from "./auth-middleware.js";
import { createAuthService } from "./services/auth/service.js";
import { createPublicAuthRouter, createAuthRouter } from "./routes/auth.js";
import overviewRouter from "./routes/overview.js";
import conversationsRouter from "./routes/conversations.js";
import messagesRouter from "./routes/messages.js";
import settingsRouter from "./routes/settings.js";
import commandsRouter from "./routes/commands.js";
import gatewayRouter from "./routes/gateway.js";
import logsRouter from "./routes/logs.js";
import relayRouter from "./routes/relay.js";
import routingRouter from "./routes/routing.js";
import composeRouter from "./routes/compose.js";
import agentsRouter from "./routes/agents.js";
import agentSessionsRouter from "./routes/agent-sessions.js";
import cronRouter from "./routes/cron.js";
import channelsRouter from "./routes/channels.js";
import toolsRouter from "./routes/tools.js";
import gatewayConfigRouter from "./routes/gateway-config.js";
import gatewayControlRouter from "./routes/gateway-control.js";
import brainRouter from "./routes/brain.js";
import reviewsRouter from "./routes/reviews.js";
import youtubeRouter from "./routes/youtube.js";
import youtubeChatRouter from "./routes/youtube-chat.js";
import youtubeRebuildRouter from "./routes/youtube-rebuild.js";
import claudeCodeRouter from "./routes/claude-code.js";
import { createTelemetryRouter } from "./routes/telemetry.js";
import { repairOnStartup } from "./services/codebase-reviewer/worker.js";
import { scanProjects } from "./services/codebase-reviewer/discovery.js";
import { repairOnStartup as repairYoutubeOnStartup } from "./services/youtube-worker.js";
import { attachWebSocket } from "./ws.js";

const app: Express = express();
app.use(express.json());

const authService = await createAuthService({
  usersPath: config.authUsersPath,
  rolesPath: config.authRolesPath,
  linksPath: config.authOidcLinksPath,
  bootstrapPath: config.authBootstrapPath,
  sessionsDir: config.authSessionsDir,
  auditPath: config.authAuditPath,
  sessionTtlMs: config.authSessionTtlMs,
  lastSeenThrottleMs: config.authSessionLastSeenThrottleMs,
  wsTicketTtlMs: config.authWsTicketTtlMs,
});
await authService.ensureSystemRoles();

app.get("/health", (_req, res) => { res.json({ ok: true, uptime: process.uptime() }); });

// Public /auth/* requires service bearer only (login, bootstrap, oidc, session/resolve)
app.use(bearerAuth);
app.use(createPublicAuthRouter(authService));

// Everything below requires actor assertion. P1 uses strict:false so dashboard can
// keep working without the header; flipped to strict:true in P6.
app.use(actorAssertionAuth(authService, { strict: false }));
app.use(createAuthRouter(authService));

app.use(overviewRouter);
app.use(conversationsRouter);
app.use(messagesRouter);
app.use(settingsRouter);
app.use(commandsRouter);
app.use(gatewayRouter);
app.use(logsRouter);
app.use(relayRouter);
app.use(routingRouter);
app.use(composeRouter);
app.use(agentsRouter);
app.use(agentSessionsRouter);
app.use(cronRouter);
app.use(channelsRouter);
app.use(toolsRouter);
app.use(gatewayConfigRouter);
app.use(gatewayControlRouter);
app.use(brainRouter);
app.use(reviewsRouter);
app.use(youtubeRouter);
app.use(youtubeChatRouter);
app.use(youtubeRebuildRouter);
app.use(claudeCodeRouter);
app.use(createTelemetryRouter({
  dir: config.telemetryDir,
  retentionDays: config.telemetryRetentionDays,
  maxDiskMB: config.telemetryMaxDiskMB,
}));

const server = app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});
attachWebSocket(server, authService);

void (async () => {
  try { await repairOnStartup(); } catch (e) { console.warn("reviewer repair failed:", e); }
  try { await scanProjects(); } catch (e) { console.warn("reviewer scan failed:", e); }
  try { await repairYoutubeOnStartup(); } catch (e) { console.warn("youtube repair failed:", e); }
  try { await authService.sessions.sweep(); } catch (e) { console.warn("session sweep failed:", e); }
})();

export { app, server, authService };
```

- [ ] **Wire ws.ts (ticket OR bearer; bearer removed in P6)**

Replace `apps/bridge/src/ws.ts`'s connection handler and `attachWebSocket` signature:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import type { AuthService } from "./services/auth/service.js";
import { getConversations } from "./services/openclaw-state.js";
import { readSettings } from "./services/runtime-settings.js";
import { onFileChange, startWatching } from "./services/file-watcher.js";
import { onBrainChange, onGlobalBrainChange } from "./services/brain.js";
import type { WsMessage } from "@openclaw-manager/types";

let _broadcast: (message: WsMessage) => void = () => {};

export function attachWebSocket(server: Server, authService: AuthService): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const ticket = url.searchParams.get("ticket") || "";
    const bearer = url.searchParams.get("token") || "";
    if (ticket) {
      const claim = await authService.consumeWsTicket(ticket);
      if (!claim) { ws.close(4001, "Unauthorized"); return; }
    } else if (bearer) {
      const a = Buffer.from(bearer), b = Buffer.from(config.token);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        ws.close(4001, "Unauthorized");
        return;
      }
    } else { ws.close(4001, "Unauthorized"); return; }
    const msg: WsMessage = { type: "connected", payload: { ts: Date.now() } };
    ws.send(JSON.stringify(msg));
  });

  const broadcastInternal = (message: WsMessage): void => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(data);
  };
  _broadcast = broadcastInternal;
  startWatching();

  onFileChange(async (file) => {
    try {
      if (file === "state") broadcastInternal({ type: "conversations_updated", payload: await getConversations() });
      else if (file === "settings") broadcastInternal({ type: "settings_updated", payload: await readSettings() });
      else if (file === "events") broadcastInternal({ type: "event_new", payload: { ts: Date.now() } });
    } catch {}
  });
  onBrainChange((e) => {
    broadcastInternal({
      type: e.kind === "removed" ? "brain_person_removed" : "brain_person_changed",
      payload: { phone: e.phone },
    });
  });
  onGlobalBrainChange((e) => {
    broadcastInternal({ type: "brain_agent_changed", payload: { updatedAt: new Date().toISOString(), kind: e.kind } });
  });
  console.log("WebSocket server attached at /ws");
}

export function broadcast(type: string, payload: unknown): void { _broadcast({ type: type as any, payload }); }
```

- [ ] **Build + run all bridge tests**

```bash
cd apps/bridge && pnpm build && pnpm test
```

- [ ] **Commit**

```bash
git add apps/bridge/src/auth-middleware.ts apps/bridge/src/routes/auth.ts \
        apps/bridge/src/server.ts apps/bridge/src/ws.ts \
        apps/bridge/test/auth-routes.test.ts
git commit -m "feat(bridge): wire /auth/* router + actor-assertion middleware (strict:false) + WS ticket path"
```

---

## Phase 2: Bootstrap + Dashboard Session Layer + Local Login

Goal: end-to-end local login. After P2: sid cookie replaces signed `admin:<ts>` cookie; middleware presence-checks sid; helpers `requireAuth`/`requirePermission`/etc. available; login page accepts `{username, password}`; logout invalidates bridge session; dashboard attaches actor assertion on every bridge call; unlinked bootstrap flow renders inline form when the bridge reports "no users".

### Task 2.1: Dashboard — actor assertion signer + bridge auth client

**Files:**
- Create: `apps/dashboard/src/lib/auth/assertion.ts`
- Create: `apps/dashboard/src/lib/auth/bridge-auth-client.ts`

- [ ] **Signer (mirrors bridge's HMAC format)**

```typescript
// apps/dashboard/src/lib/auth/assertion.ts
import crypto from "node:crypto";

const SECRET = process.env.AUTH_ASSERTION_SECRET || "";
if (!SECRET) {
  // In tests/local dev this may be empty; server-only usage enforces at runtime.
}

function b64(buf: Buffer): string { return buf.toString("base64url"); }

export function signActorAssertion(input: { sub: string; sid: string; username?: string; ttlMs?: number }): string {
  const secret = SECRET;
  if (!secret) throw new Error("AUTH_ASSERTION_SECRET not set");
  const now = Math.floor(Date.now() / 1000);
  const ttlMs = input.ttlMs ?? 60_000;
  const claims = {
    sub: input.sub, sid: input.sid, iat: now,
    exp: now + Math.floor(ttlMs / 1000),
    username: input.username,
  };
  const payload = b64(Buffer.from(JSON.stringify(claims), "utf8"));
  const mac = crypto.createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64(mac)}`;
}
```

- [ ] **Bridge auth client — all `/auth/*` calls**

```typescript
// apps/dashboard/src/lib/auth/bridge-auth-client.ts
import type {
  AuthUserPublic, PermissionId, AuthRole, AuthSession,
  AuthAuditEntry, WsTicketResponse, AuthUserCreateInput, AuthUserUpdateInput,
  AuthRoleCreateInput, AuthRoleUpdateInput,
} from "@openclaw-manager/types";
import { signActorAssertion } from "./assertion.js";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

function headers(base: Record<string, string> = {}): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${BRIDGE_TOKEN}`, ...base };
}

function authHeaders(sub: string, sid: string, username?: string): Record<string, string> {
  return headers({ "x-ocm-actor": signActorAssertion({ sub, sid, username }) });
}

async function bridge<T>(path: string, init?: RequestInit & { sub?: string; sid?: string; username?: string }): Promise<T> {
  const h = init?.sub && init?.sid ? authHeaders(init.sub, init.sid, init.username) : headers();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init, headers: { ...h, ...(init?.headers as Record<string, string>) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bridge ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function bridgeLogin(input: { username: string; password: string }): Promise<{
  sessionId: string; expiresAt: string; user: AuthUserPublic; permissions: PermissionId[];
}> {
  return bridge("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function bridgeLoginLegacy(input: { password: string }): Promise<{
  sessionId: string; expiresAt: string; user: AuthUserPublic; permissions: PermissionId[];
}> {
  return bridge("/auth/login-legacy", { method: "POST", body: JSON.stringify(input) });
}

export async function bridgeBootstrap(input: { token: string; username: string; password: string }): Promise<{ user: AuthUserPublic }> {
  return bridge("/auth/bootstrap", { method: "POST", body: JSON.stringify(input) });
}

export async function bridgeResolveSession(sid: string): Promise<{
  user: AuthUserPublic; permissions: PermissionId[]; session: { id: string; expiresAt: string };
} | null> {
  const res = await fetch(`${BRIDGE_URL}/auth/session/resolve`, {
    method: "POST", headers: headers(), body: JSON.stringify({ sid }), cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function bridgeLogout(sub: string, sid: string, username?: string): Promise<void> {
  await fetch(`${BRIDGE_URL}/auth/logout`, {
    method: "POST", headers: authHeaders(sub, sid, username), cache: "no-store",
  });
}

export async function bridgeChangePassword(
  sub: string, sid: string, username: string,
  input: { oldPassword: string; newPassword: string },
): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/auth/change-password`, {
    method: "POST", headers: authHeaders(sub, sid, username),
    body: JSON.stringify(input), cache: "no-store",
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
}

export async function bridgeIssueWsTicket(sub: string, sid: string): Promise<WsTicketResponse> {
  return bridge("/auth/ws-ticket", { method: "POST", body: "{}", sub, sid });
}

export async function bridgeOidcConfig(): Promise<{ enabled: boolean; displayName?: string }> {
  return bridge("/auth/oidc/config");
}

export async function bridgeOidcStart(returnTo?: string): Promise<{ authorizationUrl: string; state: string }> {
  return bridge("/auth/oidc/start", { method: "POST", body: JSON.stringify({ returnTo }) });
}

export async function bridgeOidcCallback(url: string): Promise<
  | { kind: "logged_in"; sessionId: string; expiresAt: string; returnTo?: string }
  | { kind: "unlinked"; issuer: string; sub: string; email?: string }
> {
  const res = await fetch(`${BRIDGE_URL}/auth/oidc/callback`, {
    method: "POST", headers: headers(), body: JSON.stringify({ url }), cache: "no-store",
  });
  if (res.status === 401) return (await res.json()) as { kind: "unlinked"; issuer: string; sub: string; email?: string };
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function bridgeLinkOidcComplete(
  sub: string, sid: string, username: string,
  input: { providerKey: string; issuer: string; sub: string; email?: string; displayName?: string },
): Promise<void> {
  await fetch(`${BRIDGE_URL}/auth/link-oidc/complete`, {
    method: "POST", headers: authHeaders(sub, sid, username),
    body: JSON.stringify(input), cache: "no-store",
  });
}

// --- Admin: users ---
export async function bridgeListUsers(sub: string, sid: string, username: string): Promise<AuthUserPublic[]> {
  const { users } = await bridge<{ users: AuthUserPublic[] }>("/auth/users", { sub, sid, username });
  return users;
}
export async function bridgeGetUser(sub: string, sid: string, username: string, id: string): Promise<AuthUserPublic> {
  const { user } = await bridge<{ user: AuthUserPublic }>(`/auth/users/${encodeURIComponent(id)}`, { sub, sid, username });
  return user;
}
export async function bridgeCreateUser(sub: string, sid: string, username: string, input: AuthUserCreateInput): Promise<AuthUserPublic> {
  const { user } = await bridge<{ user: AuthUserPublic }>("/auth/users", {
    method: "POST", body: JSON.stringify(input), sub, sid, username,
  });
  return user;
}
export async function bridgeUpdateUser(sub: string, sid: string, username: string, id: string, patch: AuthUserUpdateInput): Promise<AuthUserPublic> {
  const { user } = await bridge<{ user: AuthUserPublic }>(`/auth/users/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(patch), sub, sid, username,
  });
  return user;
}
export async function bridgeDeleteUser(sub: string, sid: string, username: string, id: string): Promise<void> {
  await bridge(`/auth/users/${encodeURIComponent(id)}`, { method: "DELETE", sub, sid, username });
}
export async function bridgeResetPassword(sub: string, sid: string, username: string, id: string, newPassword: string): Promise<void> {
  await bridge(`/auth/users/${encodeURIComponent(id)}/reset-password`, {
    method: "POST", body: JSON.stringify({ newPassword }), sub, sid, username,
  });
}
export async function bridgeUnlinkOidc(
  sub: string, sid: string, username: string,
  id: string, providerKey: string, issuer: string, ssub: string,
): Promise<void> {
  await bridge(
    `/auth/users/${encodeURIComponent(id)}/links/${encodeURIComponent(providerKey)}/${encodeURIComponent(issuer)}/${encodeURIComponent(ssub)}`,
    { method: "DELETE", sub, sid, username },
  );
}

// --- Admin: roles ---
export async function bridgeListRoles(sub: string, sid: string, username: string): Promise<AuthRole[]> {
  const { roles } = await bridge<{ roles: AuthRole[] }>("/auth/roles", { sub, sid, username });
  return roles;
}
export async function bridgeCreateRole(sub: string, sid: string, username: string, input: AuthRoleCreateInput): Promise<AuthRole> {
  const { role } = await bridge<{ role: AuthRole }>("/auth/roles", {
    method: "POST", body: JSON.stringify(input), sub, sid, username,
  });
  return role;
}
export async function bridgeUpdateRole(sub: string, sid: string, username: string, id: string, patch: AuthRoleUpdateInput): Promise<AuthRole> {
  const { role } = await bridge<{ role: AuthRole }>(`/auth/roles/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(patch), sub, sid, username,
  });
  return role;
}
export async function bridgeDeleteRole(sub: string, sid: string, username: string, id: string): Promise<void> {
  await bridge(`/auth/roles/${encodeURIComponent(id)}`, { method: "DELETE", sub, sid, username });
}

// --- Admin: sessions / audit / providers ---
export async function bridgeListSessions(sub: string, sid: string, username: string, userId?: string): Promise<AuthSession[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const { sessions } = await bridge<{ sessions: AuthSession[] }>(`/auth/sessions${qs}`, { sub, sid, username });
  return sessions;
}
export async function bridgeRevokeSession(sub: string, sid: string, username: string, targetSid: string): Promise<void> {
  await bridge(`/auth/sessions/${encodeURIComponent(targetSid)}`, { method: "DELETE", sub, sid, username });
}
export async function bridgeTailAudit(sub: string, sid: string, username: string, limit = 100): Promise<AuthAuditEntry[]> {
  const { entries } = await bridge<{ entries: AuthAuditEntry[] }>(`/auth/audit?limit=${limit}`, { sub, sid, username });
  return entries;
}
export async function bridgeGetProviders(sub: string, sid: string, username: string): Promise<{ oidc: unknown }> {
  return bridge("/auth/providers", { sub, sid, username });
}
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/lib/auth/assertion.ts apps/dashboard/src/lib/auth/bridge-auth-client.ts
git commit -m "feat(dashboard): auth bridge client + HMAC actor-assertion signer"
```

### Task 2.2: Session helpers + authZ helpers

**Files:**
- Create: `apps/dashboard/src/lib/auth/session.ts` (replaces `@/lib/session.ts`)
- Create: `apps/dashboard/src/lib/auth/current-user.ts`

- [ ] **Session cookie helpers**

```typescript
// apps/dashboard/src/lib/auth/session.ts
import { cookies } from "next/headers";

const SID_COOKIE = "ocm_sid";

function cookieSecure(): boolean {
  const o = process.env.COOKIE_SECURE;
  if (o === "true") return true;
  if (o === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function setSidCookie(sid: string, expiresAt: string): Promise<void> {
  const jar = await cookies();
  const expMs = new Date(expiresAt).getTime();
  const maxAge = Math.max(1, Math.floor((expMs - Date.now()) / 1000));
  jar.set(SID_COOKIE, sid, {
    httpOnly: true, secure: cookieSecure(), sameSite: "strict",
    path: "/", maxAge,
  });
}

export async function clearSidCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SID_COOKIE);
}

export async function getSid(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SID_COOKIE)?.value ?? null;
}
```

- [ ] **Auth helpers (uses React `cache()` for request-scoped resolution)**

```typescript
// apps/dashboard/src/lib/auth/current-user.ts
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AuthUserPublic, PermissionId } from "@openclaw-manager/types";
import { getSid } from "./session.js";
import { bridgeResolveSession } from "./bridge-auth-client.js";

export type ResolvedSession = {
  user: AuthUserPublic;
  permissions: PermissionId[];
  sid: string;
} | null;

export const resolveCurrentSession = cache(async (): Promise<ResolvedSession> => {
  const sid = await getSid();
  if (!sid) return null;
  try {
    const r = await bridgeResolveSession(sid);
    if (!r) return null;
    return { user: r.user, permissions: r.permissions, sid };
  } catch {
    return null;
  }
});

export async function getCurrentUser(): Promise<AuthUserPublic | null> {
  const s = await resolveCurrentSession();
  return s?.user ?? null;
}

export async function getEffectivePermissions(): Promise<PermissionId[]> {
  const s = await resolveCurrentSession();
  return s?.permissions ?? [];
}

export async function hasPermission(perm: PermissionId): Promise<boolean> {
  return (await getEffectivePermissions()).includes(perm);
}

export async function requireAuth(): Promise<NonNullable<ResolvedSession>> {
  const s = await resolveCurrentSession();
  if (!s) redirect("/login");
  return s;
}

export async function requirePermission(perm: PermissionId): Promise<NonNullable<ResolvedSession>> {
  const s = await requireAuth();
  if (!s.permissions.includes(perm)) redirect("/403");
  return s;
}

// API-route variant: returns { session } or throws a NextResponse-compatible object
export class AuthFailure extends Error {
  readonly status: number;
  readonly missing?: PermissionId;
  constructor(status: number, message: string, missing?: PermissionId) {
    super(message);
    this.status = status;
    this.missing = missing;
  }
}

export async function requirePermissionApi(perm: PermissionId): Promise<NonNullable<ResolvedSession>> {
  const s = await resolveCurrentSession();
  if (!s) throw new AuthFailure(401, "unauthorized");
  if (!s.permissions.includes(perm)) throw new AuthFailure(403, "forbidden", perm);
  return s;
}

export async function requireAuthApi(): Promise<NonNullable<ResolvedSession>> {
  const s = await resolveCurrentSession();
  if (!s) throw new AuthFailure(401, "unauthorized");
  return s;
}
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/lib/auth/session.ts apps/dashboard/src/lib/auth/current-user.ts
git commit -m "feat(dashboard): session cookie + requireAuth/requirePermission helpers (request-scoped cache)"
```

### Task 2.3: Replace middleware (presence-only)

**Files:**
- Modify: `apps/dashboard/src/middleware.ts`

- [ ] **Rewrite to check sid presence only; heavy resolution happens in server components/routes**

```typescript
// apps/dashboard/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SID_COOKIE = "ocm_sid";

const PUBLIC_PATHS = new Set([
  "/login",
  "/bootstrap",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const sid = request.cookies.get(SID_COOKIE)?.value;
  if (!sid) {
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    const target = forwardedHost
      ? new URL(`${forwardedProto}://${forwardedHost}/login`)
      : new URL("/login", request.url);
    target.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/middleware.ts
git commit -m "feat(dashboard): middleware does sid-presence check only; server helpers do permission gating"
```

### Task 2.4: Replace login API route

**Files:**
- Modify: `apps/dashboard/src/app/api/auth/login/route.ts`
- Modify: `apps/dashboard/src/app/api/auth/logout/route.ts`

- [ ] **Login — accepts `{username, password}`, falls back to legacy when bridge returns 401 and `users.json` empty (detected via `/auth/me`-style probe is overkill; simpler: try bridge login; on 401, try legacy)**

```typescript
// apps/dashboard/src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { setSidCookie } from "@/lib/auth/session";
import { bridgeLogin, bridgeLoginLegacy } from "@/lib/auth/bridge-auth-client";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { username?: string; password?: string; legacy?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const { username, password, legacy } = body;
  if (typeof password !== "string") {
    return NextResponse.json({ error: "password_required" }, { status: 400 });
  }

  if (legacy) {
    try {
      const r = await bridgeLoginLegacy({ password });
      await setSidCookie(r.sessionId, r.expiresAt);
      return NextResponse.json({ ok: true, user: r.user });
    } catch {
      return NextResponse.json({ error: "not_available" }, { status: 401 });
    }
  }

  if (typeof username !== "string") {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }

  try {
    const r = await bridgeLogin({ username, password });
    await setSidCookie(r.sessionId, r.expiresAt);
    return NextResponse.json({ ok: true, user: r.user });
  } catch {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
}
```

- [ ] **Logout**

```typescript
// apps/dashboard/src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { clearSidCookie } from "@/lib/auth/session";
import { resolveCurrentSession } from "@/lib/auth/current-user";
import { bridgeLogout } from "@/lib/auth/bridge-auth-client";

export async function POST(): Promise<NextResponse> {
  const s = await resolveCurrentSession();
  if (s) {
    try { await bridgeLogout(s.user.id, s.sid, s.user.username); } catch {}
  }
  await clearSidCookie();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/app/api/auth/login/route.ts apps/dashboard/src/app/api/auth/logout/route.ts
git commit -m "feat(dashboard): replace legacy login/logout with bridge-backed flows"
```

### Task 2.5: Delete legacy session.ts + fix imports

**Files:**
- Delete: `apps/dashboard/src/lib/session.ts`
- Bulk-rename imports: `@/lib/session` → `@/lib/auth/current-user` OR `@/lib/auth/session` depending on symbol

- [ ] **Find imports**

```bash
cd apps/dashboard && grep -rn 'from "@/lib/session"' src/
```

Expected: matches in api routes + `src/app/logs/page.tsx`.

- [ ] **Replace**

For each match:
- `isAuthenticated` → remove; replace usage with `await requireAuthApi()` (API routes) or `await requireAuth()` (pages).
- `createSession` / `destroySession` → already replaced by login/logout routes; remove imports.

Canonical imports after change:
- API routes: `import { requireAuthApi, requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";`
- Pages / server components: `import { requireAuth, requirePermission } from "@/lib/auth/current-user";`

- [ ] **Delete legacy file**

```bash
rm apps/dashboard/src/lib/session.ts
```

- [ ] **Build dashboard**

```bash
cd apps/dashboard && pnpm build
```

This will surface every remaining stale import. Fix each one with the canonical import listed above. Any file that still uses `isAuthenticated()` needs to be migrated to P3 enforcement in the next phase — for now, a minimum-viable shim:

```typescript
// Temporary until P3 assigns the right permission:
const s = await requireAuthApi();   // or requireAuth() for pages
```

- [ ] **Commit**

```bash
git add -A apps/dashboard/src
git rm apps/dashboard/src/lib/session.ts 2>/dev/null || true
git commit -m "refactor(dashboard): replace legacy isAuthenticated()/session.ts with requireAuth helpers"
```

### Task 2.6: Replace login page (username/password + OIDC button + bootstrap banner)

**Files:**
- Modify: `apps/dashboard/src/app/login/page.tsx`
- Create: `apps/dashboard/src/app/login/login-form.tsx` (client component)

- [ ] **Server component: probe `/auth/oidc/config` and check if bootstrap is needed (users empty)**

The bridge doesn't expose a direct "users empty?" query (we don't want an anonymous endpoint for that). Instead, the login form tries regular login first; if the bridge returns a specific signal that bootstrap is required (401 with `{ error: "bootstrap_required" }`), the dashboard redirects to `/bootstrap`. To make this work the bridge `/auth/login` responds with **`401 { error: "bootstrap_required" }` when users.json is empty and no legacy password is configured**.

Adjust `apps/bridge/src/routes/auth.ts` `/auth/login` to pre-check:

```typescript
// inside r.post("/auth/login", ...)
if (await svc.isEmpty()) {
  res.status(401).json({ error: "bootstrap_required" });
  return;
}
```

(Apply this change in Task 1.16 if not already — safe to re-commit as a touch-up.)

- [ ] **`login/page.tsx` — server component**

```tsx
// apps/dashboard/src/app/login/page.tsx
import { bridgeOidcConfig } from "@/lib/auth/bridge-auth-client";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: { searchParams: Promise<{ redirect?: string; oidc_unlinked?: string }> }) {
  const sp = await props.searchParams;
  let oidc: { enabled: boolean; displayName?: string } = { enabled: false };
  try { oidc = await bridgeOidcConfig(); } catch {}
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-sm">
        <div className="h-1 rounded-t bg-gradient-to-r from-primary to-[#AA6CC0]" />
        <div className="rounded-b bg-dark-card p-8 shadow-card-dark">
          <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="mx-auto mb-4 h-16 w-auto" />
          <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-text-primary">OpenClaw Manager</h1>
          <p className="mb-6 text-center text-sm text-text-muted">Sign in</p>
          <LoginForm oidcEnabled={oidc.enabled} oidcDisplayName={oidc.displayName} redirect={sp.redirect} oidcUnlinked={sp.oidc_unlinked === "1"} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **`login/login-form.tsx` — client component**

```tsx
// apps/dashboard/src/app/login/login-form.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({
  oidcEnabled, oidcDisplayName, redirect, oidcUnlinked,
}: {
  oidcEnabled: boolean; oidcDisplayName?: string; redirect?: string; oidcUnlinked?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
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
      router.push(redirect || "/");
      router.refresh();
    } finally { setLoading(false); }
  }

  async function loginOidc(): Promise<void> {
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/oidc/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: redirect }),
      });
      if (!res.ok) { setError("OIDC unavailable"); return; }
      const { authorizationUrl } = await res.json();
      window.location.href = authorizationUrl;
    } catch { setError("OIDC unavailable"); setLoading(false); }
  }

  return (
    <form onSubmit={submit}>
      {oidcUnlinked && (
        <div className="mb-4 rounded border border-warn-dim bg-warn-dim/40 p-3 text-sm text-warn">
          Your external identity is not linked to any local user. Sign in locally first, then link from your profile.
        </div>
      )}
      <label className="mb-2 block text-sm text-text-gray" htmlFor="username">Username</label>
      <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        autoFocus autoComplete="username" />
      <label className="mb-2 block text-sm text-text-gray" htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none focus:border-primary"
        autoComplete="current-password" />
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={loading || !username || !password}
        className="w-full rounded-pill bg-primary py-3 px-6 font-medium text-white disabled:opacity-50">
        {loading ? "Signing in..." : "Sign in"}
      </button>
      {oidcEnabled && (
        <>
          <div className="my-4 text-center text-xs text-text-muted">or</div>
          <button type="button" onClick={loginOidc} disabled={loading}
            className="w-full rounded-pill border border-dark-border bg-dark-card py-3 px-6 font-medium text-text-primary disabled:opacity-50">
            Sign in with {oidcDisplayName || "SSO"}
          </button>
        </>
      )}
    </form>
  );
}
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/app/login/
git commit -m "feat(dashboard): new login page — username+password + OIDC button + bootstrap redirect"
```

### Task 2.7: Bootstrap page + route

**Files:**
- Create: `apps/dashboard/src/app/bootstrap/page.tsx`
- Create: `apps/dashboard/src/app/api/auth/bootstrap/route.ts`

- [ ] **API route proxies to bridge + sets cookie**

```typescript
// apps/dashboard/src/app/api/auth/bootstrap/route.ts
import { NextResponse } from "next/server";
import { bridgeBootstrap, bridgeLogin } from "@/lib/auth/bridge-auth-client";
import { setSidCookie } from "@/lib/auth/session";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { token?: string; username?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const { token, username, password } = body;
  if (typeof token !== "string" || typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "token, username, password required" }, { status: 400 });
  }
  try {
    await bridgeBootstrap({ token, username, password });
  } catch (err) {
    return NextResponse.json({ error: "bootstrap_failed", detail: String((err as Error).message) }, { status: 403 });
  }
  // Auto-login after successful bootstrap
  try {
    const r = await bridgeLogin({ username, password });
    await setSidCookie(r.sessionId, r.expiresAt);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, note: "bootstrap_ok_login_failed" });
  }
}
```

- [ ] **Page (client form + server wrapper)**

```tsx
// apps/dashboard/src/app/bootstrap/page.tsx
import { BootstrapForm } from "./bootstrap-form";

export default function BootstrapPage(props: { searchParams: Promise<{ redirect?: string }> }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-md">
        <div className="h-1 rounded-t bg-gradient-to-r from-primary to-[#AA6CC0]" />
        <div className="rounded-b bg-dark-card p-8 shadow-card-dark">
          <h1 className="mb-2 text-center text-2xl font-semibold text-text-primary">First-run setup</h1>
          <p className="mb-6 text-center text-sm text-text-muted">
            Create the first admin user. You will need the bootstrap token set in <code>AUTH_BOOTSTRAP_TOKEN</code>.
          </p>
          <BootstrapForm />
        </div>
      </div>
    </div>
  );
}
```

```tsx
// apps/dashboard/src/app/bootstrap/bootstrap-form.tsx
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
        method: "POST", headers: { "Content-Type": "application/json" },
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
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base outline-none focus:border-primary" required />
      <label className="mb-2 block text-sm text-text-gray">Admin username</label>
      <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base outline-none focus:border-primary" required />
      <label className="mb-2 block text-sm text-text-gray">Admin password (≥ 8 chars)</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
        className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base outline-none focus:border-primary" required />
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full rounded-pill bg-primary py-3 px-6 font-medium text-white disabled:opacity-50">
        {loading ? "Creating..." : "Create admin & sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/app/bootstrap apps/dashboard/src/app/api/auth/bootstrap
git commit -m "feat(dashboard): bootstrap page + API route (auto-login after success)"
```

### Task 2.8: 403 page + change-password page

**Files:**
- Create: `apps/dashboard/src/app/403/page.tsx`
- Create: `apps/dashboard/src/app/change-password/page.tsx`
- Create: `apps/dashboard/src/app/change-password/change-form.tsx`
- Create: `apps/dashboard/src/app/api/auth/change-password/route.ts`

- [ ] **403 page**

```tsx
// apps/dashboard/src/app/403/page.tsx
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Page() {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-2 text-3xl font-semibold text-text-primary">Access denied</h1>
        <p className="mb-6 text-sm text-text-muted">
          {user ? `You are signed in as ${user.username}, but you don't have permission to view this page.` : "You need to sign in to continue."}
        </p>
        <Link href="/" className="rounded-pill bg-primary py-3 px-6 font-medium text-white">Back to overview</Link>
      </div>
    </div>
  );
}
```

- [ ] **Change password API route**

```typescript
// apps/dashboard/src/app/api/auth/change-password/route.ts
import { NextResponse } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeChangePassword } from "@/lib/auth/bridge-auth-client";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    const { oldPassword, newPassword } = (await request.json()) ?? {};
    if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json({ error: "oldPassword and newPassword required" }, { status: 400 });
    }
    await bridgeChangePassword(s.user.id, s.sid, s.user.username, { oldPassword, newPassword });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Page**

```tsx
// apps/dashboard/src/app/change-password/page.tsx
import { requireAuth } from "@/lib/auth/current-user";
import { ChangeForm } from "./change-form";

export default async function Page() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Change password</h1>
      <ChangeForm />
    </div>
  );
}
```

```tsx
// apps/dashboard/src/app/change-password/change-form.tsx
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    setLoading(false);
    if (res.ok) { setMsg("Password updated."); setOld(""); setNew(""); return; }
    const body = await res.json().catch(() => ({}));
    setMsg(body?.error || "Failed");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="password" placeholder="Current password" value={oldPassword} onChange={(e) => setOld(e.target.value)}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base outline-none focus:border-primary" required />
      <input type="password" placeholder="New password (≥ 8 chars)" value={newPassword} minLength={8} onChange={(e) => setNew(e.target.value)}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base outline-none focus:border-primary" required />
      {msg && <p className="text-sm text-text-muted">{msg}</p>}
      <button type="submit" disabled={loading}
        className="rounded-pill bg-primary py-3 px-6 font-medium text-white disabled:opacity-50">
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/app/403 apps/dashboard/src/app/change-password apps/dashboard/src/app/api/auth/change-password
git commit -m "feat(dashboard): 403 page + self-service change-password page"
```

### Task 2.9: Update bridge-client to attach actor assertion

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`
- Create: `apps/dashboard/src/lib/auth/bridge-actor.ts` (wrapper used by bridge-client)

- [ ] **Actor-header wrapper**

```typescript
// apps/dashboard/src/lib/auth/bridge-actor.ts
import { resolveCurrentSession } from "./current-user.js";
import { signActorAssertion } from "./assertion.js";

export async function actorHeaders(): Promise<Record<string, string>> {
  const s = await resolveCurrentSession();
  if (!s) return {};
  return { "x-ocm-actor": signActorAssertion({ sub: s.user.id, sid: s.sid, username: s.user.username }) };
}
```

- [ ] **Modify `bridge-client.ts` — single edit point in `bridgeFetch`**

```typescript
// apps/dashboard/src/lib/bridge-client.ts  (patch bridgeFetch)
import { actorHeaders } from "./auth/bridge-actor.js";

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const actor = await actorHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
      ...options?.headers,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  return res.json();
}
```

Also replace the raw `fetch` calls in `deleteYoutubeSummary` (and any others that bypass `bridgeFetch`) to go through `bridgeFetch` so they get actor headers too.

- [ ] **Commit**

```bash
git add apps/dashboard/src/lib/auth/bridge-actor.ts apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): attach signed actor assertion on every bridge call"
```

### Task 2.10: Telemetry actor resolution + fix hardcoded "admin"

**Files:**
- Modify: `apps/dashboard/src/app/api/telemetry/actions/route.ts`
- Modify: `apps/dashboard/src/lib/telemetry.ts`

- [ ] **Route uses resolved user; anonymous (no session) is rejected on POST.**

```typescript
// apps/dashboard/src/app/api/telemetry/actions/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAuthApi, requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { TELEMETRY_SCHEMA_VERSION, type TelemetryEventInput } from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    let body: TelemetryEventInput;
    try { body = (await req.json()) as TelemetryEventInput; }
    catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
    const trusted: TelemetryEventInput = {
      ...body,
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      source: "dashboard",
      surface: body.surface === "web" ? "web" : undefined,
      actor: { type: "user", id: s.user.id },
    };
    const res = await fetch(`${BRIDGE_URL}/telemetry/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRIDGE_TOKEN}` },
      body: JSON.stringify(trusted),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "bridge unreachable" }, { status: 503 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requirePermissionApi("telemetry.read");
    const qs = req.nextUrl.search;
    const res = await fetch(`${BRIDGE_URL}/telemetry/actions${qs}`, {
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: "bridge unreachable" }, { status: 503 });
  }
}
```

- [ ] **Client-side telemetry — remove hardcoded `"anon"`; server-side resolves actor. Switch to sending `actor` undefined so the server always overwrites.**

```typescript
// apps/dashboard/src/lib/telemetry.ts — patch payload construction
// replace:
//   actor: { type: "user", id: "anon" },
// with:
//   actor: { type: "user", id: "self" }, // server overwrites with resolved session
```

Keep the shape valid — the bridge treats `actor.id` as opaque and the dashboard route overwrites.

- [ ] **Commit**

```bash
git add apps/dashboard/src/app/api/telemetry/actions/route.ts apps/dashboard/src/lib/telemetry.ts
git commit -m "feat(dashboard): telemetry actor from resolved session (drops hardcoded admin/anon)"
```

### Task 2.11: User menu component + sidebar footer

**Files:**
- Create: `apps/dashboard/src/components/user-menu.tsx`
- Modify: `apps/dashboard/src/components/sidebar.tsx` (footer only — full nav filtering lives in P3)

- [ ] **UserMenu**

```tsx
// apps/dashboard/src/components/user-menu.tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserMenu({ username, displayName }: { username: string; displayName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2">
        <div className="sb-foot-avatar">{username.slice(0, 2).toUpperCase()}</div>
        <div className="sb-foot-text">
          <div className="n">{displayName || username}</div>
          <div className="s mono">{username}</div>
        </div>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 w-48 rounded border border-dark-border bg-dark-card p-2 shadow-card-dark">
          <Link href="/change-password" className="block rounded px-3 py-2 text-sm hover:bg-dark">Change password</Link>
          <button type="button" onClick={logout} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-dark">Log out</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Sidebar footer shows current user (nav filtering deferred to P3)**

Modify `apps/dashboard/src/components/sidebar.tsx` — accept an optional `currentUser` prop, render it in the footer. The root layout fetches it and passes down.

```tsx
// excerpt: sidebar.tsx footer
{currentUser ? (
  <UserMenu username={currentUser.username} displayName={currentUser.displayName} />
) : (
  <div className="sb-foot-avatar">OC</div>
)}
```

- [ ] **Root layout passes `currentUser`**

```tsx
// apps/dashboard/src/app/layout.tsx (excerpt)
import { getCurrentUser } from "@/lib/auth/current-user";
// ...
const user = await getCurrentUser();
// pass to sidebar via props
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/components/user-menu.tsx apps/dashboard/src/components/sidebar.tsx apps/dashboard/src/app/layout.tsx
git commit -m "feat(dashboard): user menu in sidebar footer (logout + change password)"
```

### Task 2.12: Full build + smoke

- [ ] **Run**

```bash
cd apps/bridge && pnpm build
cd ../.. && pnpm --filter dashboard build
cd apps/bridge && pnpm test
```

All green. Phase 2 complete.

---

## Phase 3: Enforcement Across Dashboard

Goal: every page, API route, server action, sidebar entry, and action button is gated by the right permission. No more implicit-admin access.

### Task 3.1: PermissionGate component + sidebar permission filter

**Files:**
- Create: `apps/dashboard/src/components/permission-gate.tsx`
- Modify: `apps/dashboard/src/components/sidebar.tsx`
- Modify: `apps/dashboard/src/app/layout.tsx`

- [ ] **PermissionGate (client helper)**

```tsx
// apps/dashboard/src/components/permission-gate.tsx
"use client";
import type { PermissionId } from "@openclaw-manager/types";
import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext<Set<PermissionId>>(new Set());

export function PermissionProvider({ permissions, children }: { permissions: PermissionId[]; children: ReactNode }) {
  return <Ctx.Provider value={new Set(permissions)}>{children}</Ctx.Provider>;
}

export function usePermissions(): Set<PermissionId> { return useContext(Ctx); }

export function PermissionGate({ perm, children, fallback = null }: {
  perm: PermissionId; children: ReactNode; fallback?: ReactNode;
}) {
  const set = usePermissions();
  if (!set.has(perm)) return <>{fallback}</>;
  return <>{children}</>;
}
```

- [ ] **Sidebar — accept permissions, filter nav. Each nav item declares `perm: PermissionId` (use `overview.view` for root).**

```tsx
// apps/dashboard/src/components/sidebar.tsx — updated NAV and filter
const NAV: Array<{ group: string; items: Array<{ id: string; label: string; href: string; icon: IconName; perm: PermissionId }> }> = [
  { group: "Monitor", items: [
    { id: "overview",      label: "Overview",      href: "/",                 icon: "home",    perm: "overview.view" },
    { id: "conversations", label: "Conversations", href: "/conversations",    icon: "chat",    perm: "conversations.view" },
    { id: "claude_code",   label: "Claude Code",   href: "/claude-code",      icon: "code",    perm: "claude_code.view" },
    { id: "review_inbox",  label: "Review Inbox",  href: "/reviews/inbox",    icon: "review",  perm: "reviews.view" },
  ]},
  { group: "Runtime", items: [
    { id: "agents",   label: "Agents",         href: "/agents",   icon: "agents",   perm: "agents.view" },
    { id: "sessions", label: "Sessions",       href: "/sessions", icon: "sessions", perm: "agent_sessions.view" },
    { id: "youtube",  label: "YouTube Relay",  href: "/youtube",  icon: "yt",       perm: "youtube.view" },
    { id: "cron",     label: "Cron",           href: "/cron",     icon: "cron",     perm: "cron.view" },
  ]},
  { group: "Configure", items: [
    { id: "channels",   label: "Channels",      href: "/channels",     icon: "channels", perm: "channels.view" },
    { id: "tools",      label: "Tools",         href: "/tools",        icon: "tools",    perm: "tools.view" },
    { id: "routing",    label: "Routing Rules", href: "/routing",      icon: "rules",    perm: "routing.view" },
    { id: "brain",      label: "Brain · People", href: "/brain/people", icon: "brain",   perm: "brain.people.read" },
    { id: "brain-agent", label: "Brain · Global", href: "/brain/agent", icon: "brain",   perm: "brain.global.read" },
  ]},
  { group: "Advanced", items: [
    { id: "capabilities", label: "Capabilities", href: "/capabilities", icon: "caps",     perm: "capabilities.view" },
    { id: "commands",     label: "Commands",     href: "/commands",     icon: "cmd",      perm: "commands.run" },
    { id: "config",       label: "Raw Config",   href: "/config",       icon: "config",   perm: "config.raw.read" },
    { id: "settings",     label: "Settings",     href: "/settings",     icon: "settings", perm: "settings.read" },
    { id: "logs",         label: "Logs",         href: "/logs",         icon: "logs",     perm: "logs.read" },
  ]},
  { group: "Admin", items: [
    { id: "admin_users",     label: "Users",     href: "/admin/users",    icon: "config", perm: "auth.users.read" },
    { id: "admin_roles",     label: "Roles",     href: "/admin/roles",    icon: "config", perm: "auth.roles.read" },
    { id: "admin_providers", label: "Providers", href: "/admin/auth",     icon: "config", perm: "auth.providers.read" },
    { id: "admin_audit",     label: "Audit",     href: "/admin/audit",    icon: "logs",   perm: "auth.audit.read" },
  ]},
];

export function Sidebar({ badges = {}, permissions, currentUser }: {
  badges?: Record<string, number>; permissions: PermissionId[]; currentUser: AuthUserPublic | null;
}) {
  const pathname = usePathname();
  const have = new Set(permissions);
  return (
    <aside className="sb">
      {/* ...brand unchanged... */}
      <div className="sb-scroll">
        {NAV.map((sec) => {
          const items = sec.items.filter((it) => have.has(it.perm));
          if (items.length === 0) return null;
          return (
            <div className="sb-sec" key={sec.group}>
              <div className="sb-sec-h">{sec.group}</div>
              {items.map((item) => { /* unchanged render with badges etc */ })}
            </div>
          );
        })}
      </div>
      <div className="sb-foot">
        {currentUser ? <UserMenu username={currentUser.username} displayName={currentUser.displayName} /> : null}
      </div>
    </aside>
  );
}
```

- [ ] **Layout passes perms + user + wraps tree in PermissionProvider**

```tsx
// apps/dashboard/src/app/layout.tsx
import { getCurrentUser, getEffectivePermissions } from "@/lib/auth/current-user";
import { PermissionProvider } from "@/components/permission-gate";
// ...
const [user, permissions] = await Promise.all([getCurrentUser(), getEffectivePermissions()]);
return (
  <html lang="en">
    <body>
      <PermissionProvider permissions={permissions}>
        <div className="layout">
          <Sidebar permissions={permissions} currentUser={user} badges={...} />
          <main>{children}</main>
        </div>
      </PermissionProvider>
    </body>
  </html>
);
```

- [ ] **Commit**

```bash
git add apps/dashboard/src/components/permission-gate.tsx apps/dashboard/src/components/sidebar.tsx apps/dashboard/src/app/layout.tsx
git commit -m "feat(dashboard): permission-gated sidebar + PermissionProvider/PermissionGate"
```

### Task 3.2: Canonical enforcement templates

Each template below is the **canonical pattern** used throughout Phase 3. The per-feature tasks that follow only enumerate files and permissions; the implementer applies the matching template.

#### Template A — Page (server component)

```tsx
// apps/dashboard/src/app/<feature>/page.tsx
import { requirePermission } from "@/lib/auth/current-user";

export default async function Page() {
  await requirePermission("<perm>");
  // existing server-component body unchanged
}
```

Multi-perm page (either/any): use `getEffectivePermissions()` and redirect to `/403` manually.

#### Template B — Dashboard API route

```ts
// apps/dashboard/src/app/api/<...>/route.ts
import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function <METHOD>(req: Request): Promise<NextResponse> {
  let session;
  try { session = await requirePermissionApi("<perm>"); }
  catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    throw err;
  }
  // existing body unchanged — `session.user` available for attribution
}
```

Multiple methods with different perms: re-apply the try/catch per handler with the right `<perm>`.

#### Template C — Server action

```ts
// apps/dashboard/src/app/<feature>/actions.ts
"use server";
import { requirePermission } from "@/lib/auth/current-user";

export async function someAction(...args): Promise<...> {
  await requirePermission("<perm>");
  // existing body unchanged
}
```

Client UI that calls the action should wrap in try/catch and show `"You don't have permission to do that."` on `Error` messages starting with `"FORBIDDEN:"` (currently `requirePermission` `redirect()`s inside a server action is permitted — Next will throw `NEXT_REDIRECT` which the client rethrows and Next handles).

#### Template D — Action button / inline control

```tsx
// any component in the rendered tree
import { PermissionGate } from "@/components/permission-gate";
<PermissionGate perm="<perm>"><ButtonOrControl /></PermissionGate>
```

Buttons that require ONE of several perms: compose multiple gates OR check via `usePermissions()` hook directly.

#### Template E — Layout with permission-gated children

For `/admin/**` and similarly restricted subtrees, put a `requirePermission` at the top of `layout.tsx` to short-circuit before any child renders.

```tsx
// apps/dashboard/src/app/admin/layout.tsx
import { getEffectivePermissions } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

const ADMIN_PERMS = ["auth.users.read","auth.roles.read","auth.providers.read","auth.audit.read"] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perms = await getEffectivePermissions();
  if (!ADMIN_PERMS.some((p) => perms.includes(p))) redirect("/403");
  return <>{children}</>;
}
```

### Task 3.3: Feature-area enforcement — Conversations + Messages + Compose

**Files to touch:**

| File | Surface | Current | Permission(s) | Helper | Deny |
|---|---|---|---|---|---|
| `apps/dashboard/src/app/page.tsx` | Page | shim auth | `overview.view` | Template A | redirect `/403` |
| `apps/dashboard/src/app/conversations/page.tsx` | Page | shim | `conversations.view` | A | redirect |
| `apps/dashboard/src/app/conversations/[conversationKey]/page.tsx` | Page | shim | `conversations.view` | A | redirect |
| `apps/dashboard/src/app/api/conversations/[conversationKey]/takeover/route.ts` | API POST | UNPROTECTED | `conversations.takeover` | B | 403 JSON |
| `apps/dashboard/src/app/api/conversations/[conversationKey]/release/route.ts` | API POST | UNPROTECTED | `conversations.release` | B | 403 JSON |
| `apps/dashboard/src/app/api/conversations/[conversationKey]/wake-now/route.ts` | API POST | UNPROTECTED | `conversations.wake` | B | 403 JSON |
| `apps/dashboard/src/app/api/messages/route.ts` | API GET | shim | `messages.view` — wait, re-read: messages are just conversation events. Use `conversations.view`. | B | 401/403 |
| `apps/dashboard/src/app/api/compose/route.ts` | API POST | shim | `conversations.send` | B | 403 |
| Takeover/Release/Wake/Send buttons in conversation detail UI | UI | always visible | Wrap in `PermissionGate` with matching perm | D | hidden |

- [ ] Implement each per its template.
- [ ] Build.
- [ ] Commit: `feat(dashboard): enforce permissions across conversations + messages + compose`

### Task 3.4: Feature-area enforcement — Claude Code

| File | Surface | Permission | Helper |
|---|---|---|---|
| `apps/dashboard/src/app/claude-code/page.tsx` | Page | `claude_code.view` | A |
| `apps/dashboard/src/app/claude-code/[id]/page.tsx` | Page | `claude_code.view` | A |
| `apps/dashboard/src/app/api/claude-code/sessions/[id]/route.ts` GET | API | `claude_code.view` | B |
| `apps/dashboard/src/app/api/claude-code/sessions/[id]/route.ts` PATCH (mode) | API | `claude_code.change_mode` (mode changes) or `claude_code.rename` (name/state) | B — switch on body fields |
| `apps/dashboard/src/app/api/claude-code/sessions/[id]/summary/route.ts` POST | API | `claude_code.summarize` | B |
| `apps/dashboard/src/app/api/claude-code/pending/[id]/route.ts` POST | API | `claude_code.resolve_pending` | B |
| `apps/dashboard/src/app/api/claude-code/connect-config/route.ts` | API | `claude_code.view` | B |
| UI mode toggle button | UI | `claude_code.change_mode` | D |
| UI resolve/edit/discard controls | UI | `claude_code.resolve_pending` | D |

- [ ] Patch + commit: `feat(dashboard): enforce Claude Code permissions`.

### Task 3.5: Feature-area enforcement — Reviews

| File | Surface | Permission |
|---|---|---|
| `apps/dashboard/src/app/reviews/page.tsx` | Page | `reviews.view` |
| `apps/dashboard/src/app/reviews/[projectId]/page.tsx` | Page | `reviews.view` |
| `apps/dashboard/src/app/reviews/ideas/page.tsx` | Page | `reviews.view` |
| `apps/dashboard/src/app/reviews/inbox/page.tsx` | Page | `reviews.view` |
| `apps/dashboard/src/app/api/reviews/projects/route.ts` GET | API | `reviews.view` |
| `apps/dashboard/src/app/api/reviews/projects/route.ts` POST (add) | API | `reviews.manage_projects` |
| `apps/dashboard/src/app/api/reviews/projects/scan/route.ts` | API | `reviews.manage_projects` |
| `apps/dashboard/src/app/api/reviews/projects/[id]/route.ts` GET | API | `reviews.view` |
| ... PATCH (enabled) | API | `reviews.manage_projects` |
| ... POST (run) | API | `reviews.run_now` |
| ... POST (ack) | API | `reviews.triage` |
| `apps/dashboard/src/app/api/reviews/ideas/route.ts` GET | API | `reviews.view` |
| `apps/dashboard/src/app/api/reviews/ideas/route.ts` PATCH | API | `reviews.triage` |
| `apps/dashboard/src/app/api/reviews/inbox/route.ts` | API | `reviews.view` |
| `apps/dashboard/src/app/reviews/actions.ts` | Server actions | see below |
| `apps/dashboard/src/app/reviews/[projectId]/idea-actions.ts` | Server actions | see below |

Server actions:
- `scanAction` → `reviews.manage_projects`
- `runNowAction` → `reviews.run_now`
- `ackAction` → `reviews.triage`
- `toggleEnabledAction` → `reviews.manage_projects`
- `setTriageAction` → `reviews.triage`
- `addProjectAction` → `reviews.manage_projects`
- `setIdeaStatusAction` → `reviews.triage`

UI:
- Run-now, Enable toggle, Scan, Add-project buttons → `PermissionGate`.
- Triage buttons in inbox → `PermissionGate perm="reviews.triage"`.

- [ ] Commit: `feat(dashboard): enforce reviews permissions (incl. server actions)`.

### Task 3.6: Feature-area enforcement — Agents + Agent Sessions

| File | Surface | Permission |
|---|---|---|
| `apps/dashboard/src/app/agents/page.tsx` | Page | `agents.view` |
| `apps/dashboard/src/app/agents/[name]/page.tsx` | Page | `agents.view` |
| `apps/dashboard/src/app/sessions/page.tsx` | Page | `agent_sessions.view` |
| `apps/dashboard/src/app/sessions/[id]/page.tsx` | Page | `agent_sessions.view` |
| `/api/agents` GET | API | `agents.view` |
| `/api/agents` POST/DELETE | API | `agents.manage` |
| `/api/agents/[name]` GET | API | `agents.view` |
| `/api/agents/[name]` PATCH/DELETE | API | `agents.manage` |
| `/api/agent-sessions` GET | API | `agent_sessions.view` |
| `/api/agent-sessions` POST | API | `agent_sessions.create` |
| `/api/agent-sessions/[id]` GET | API | `agent_sessions.view` |
| `/api/agent-sessions/[id]` POST (send) | API | `agent_sessions.send` |
| `/api/agent-sessions/[id]` PATCH (usage/reset/abort/compact) — separate handlers | API | resp: `reset→agent_sessions.reset`, `abort→agent_sessions.abort`, `compact→agent_sessions.compact` |
| `/api/agent-sessions/[id]` DELETE | API | `agent_sessions.delete` |

UI: create/delete/reset/abort/compact/delete buttons → per-perm gates.

- [ ] Commit.

### Task 3.7: Feature-area enforcement — YouTube

| File | Surface | Permission |
|---|---|---|
| `apps/dashboard/src/app/youtube/page.tsx` | Page | `youtube.view` |
| `apps/dashboard/src/app/youtube/[videoId]/page.tsx` | Page | `youtube.view` |
| `/api/youtube/summaries` GET | API | `youtube.view` |
| `/api/youtube/summaries/[videoId]` GET | API | `youtube.view` |
| `/api/youtube/summaries/[videoId]` DELETE | API | `youtube.delete` |
| `/api/youtube/summaries/[videoId]/rerun` POST | API | `youtube.rerun` |
| `/api/youtube/jobs` GET | API | `youtube.view` |
| `/api/youtube/jobs` POST | API | `youtube.submit` |
| `/api/youtube/submit` POST | API | `youtube.submit` |
| `/api/youtube/chat/[videoId]` GET | API | `youtube.view` |
| `/api/youtube/chat/[videoId]` POST | API | `youtube.chat` |
| `/api/youtube/rebuild/[videoId]` POST | API | `youtube.rebuild` |
| `/api/youtube/rebuild/[videoId]/status` GET | API | `youtube.view` |
| `/api/youtube/rebuild/active` GET | API | `youtube.view` |
| `/api/youtube/chunks/[videoId]` GET | API | `youtube.view` |
| `/api/youtube/chapters/[videoId]` GET | API | `youtube.view` |
| `/api/youtube/highlights/[videoId]` GET | API | `youtube.view` |

UI: Submit, Delete, Rerun, Rebuild, Send-in-chat → per-perm gates.

- [ ] Commit.

### Task 3.8: Feature-area enforcement — Cron / Channels / Tools

| File | Surface | Permission |
|---|---|---|
| `/cron` page | Page | `cron.view` |
| `/api/cron` GET | API | `cron.view` |
| `/api/cron` POST | API | `cron.manage` |
| `/api/cron/[id]` GET (status) | API | `cron.view` |
| `/api/cron/[id]` POST (run) | API | `cron.run` |
| `/api/cron/[id]` DELETE | API | `cron.manage` |
| `/channels` page | Page | `channels.view` |
| `/api/channels` GET | API | `channels.view` |
| `/api/channels` (logout action) | API | `channels.logout` |
| `/tools` page | Page | `tools.view` |
| `/api/tools` GET | API | `tools.view` |
| `/api/tools` POST (install) | API | `tools.install` |

UI: Add/remove/run-cron, Logout-channel, Install-skill buttons → per-perm gates.

- [ ] Commit.

### Task 3.9: Feature-area enforcement — Routing / Relay / Brain / Capabilities

| File | Surface | Permission |
|---|---|---|
| `/routing` page | Page | `routing.view` |
| `/api/routing` GET | API | `routing.view` |
| `/api/routing` POST/PUT/DELETE | API | `routing.manage` |
| `/relay` page | Page | `relay.view` |
| `/api/relay` GET | API | `relay.view` |
| `/api/relay` POST/PATCH/DELETE | API | `relay.manage` |
| `/brain/people` page | Page | `brain.people.read` |
| `/brain/people/[phone]` page | Page | `brain.people.read` |
| `/brain/agent` page | Page | `brain.global.read` |
| `/api/brain/people` GET | API | `brain.people.read` |
| `/api/brain/people` POST | API | `brain.people.write` |
| `/api/brain/people/[phone]` GET | API | `brain.people.read` |
| `/api/brain/people/[phone]` PATCH | API | `brain.people.write` |
| `/api/brain/people/[phone]/log` POST | API | `brain.people.write` |
| `/api/brain/people/[phone]/log/[index]/promote` POST | API | `brain.people.write` |
| `/api/brain/people/[phone]/preview` GET | API | `brain.people.read` |
| `/api/brain/agent` GET | API | `brain.global.read` |
| `/api/brain/agent` PATCH | API | `brain.global.write` |
| `/api/brain/agent/preview` GET | API | `brain.global.read` |
| `/capabilities` page | Page | `capabilities.view` |
| `/api/capabilities/enroll` POST | API | `capabilities.enroll` |

- [ ] Commit.

### Task 3.10: Feature-area enforcement — Commands / Gateway / Config / Settings

| File | Surface | Permission |
|---|---|---|
| `/commands` page | Page | `commands.run` |
| `/config` page | Page | `config.raw.read` |
| `/settings` page | Page | `settings.read` |
| `/api/gateway` POST | API | `commands.gateway_proxy` |
| `/api/gateway-status` GET/POST | API | `commands.gateway_proxy` |
| `/api/gateway-config` GET | API | `config.raw.read` |
| `/api/gateway-config` PATCH | API | `config.raw.write` |
| `/api/gateway-config/apply` POST (if proxied via this route) | API | `config.raw.apply` |
| `/api/settings` GET | API | `settings.read` |
| `/api/settings` PATCH | API | `settings.write` |
| `/api/events` GET | API | `conversations.view` (events drive the conversations UI) |

Commands page: consider splitting the `commands.gateway_proxy` permission from `commands.run` at the UI — they're coarse enough that same perm is fine in v1 as listed.

- [ ] Commit.

### Task 3.11: Feature-area enforcement — Logs / Telemetry

| File | Surface | Permission |
|---|---|---|
| `/logs` page | Page | `logs.read` |
| `/api/logs` POST | API | `logs.read` |
| `/api/telemetry/actions` GET | API | `telemetry.read` (already applied in Task 2.10) |
| `/api/telemetry/actions` POST | API | `requireAuthApi()` (any authenticated user can self-report telemetry) |

- [ ] Commit.

### Task 3.12: Drop the `isAuthenticated` shim + strict assertion

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Search repo for any remaining `requireAuthApi()` call that should have a real permission — promote to `requirePermissionApi(<perm>)`.

- [ ] **Flip actor assertion middleware to strict mode**

```typescript
// apps/bridge/src/server.ts
app.use(actorAssertionAuth(authService, { strict: true }));
```

- [ ] **Close remaining API-route gaps**

Run:

```bash
cd apps/dashboard && grep -rn "requireAuthApi()" src/app/api
```

Every remaining call that isn't `POST /api/auth/*`, `POST /api/telemetry/actions`, or `POST /api/auth/ws-ticket` must be promoted to `requirePermissionApi(<perm>)`. No exceptions.

- [ ] **Build + test**

```bash
cd apps/bridge && pnpm build && pnpm test
cd ../.. && pnpm --filter dashboard build
```

- [ ] **Commit**

```bash
git add apps/bridge/src/server.ts apps/dashboard/src/app/api
git commit -m "feat: strict actor assertion + remove isAuthenticated shim (all API routes gated)"
```

### Task 3.13: Enforcement tests (bridge-side)

**Files:**
- Create: `apps/bridge/test/auth-middleware.test.ts`

At minimum, cover:
- `actorAssertionAuth` rejects missing header in strict mode (401).
- `actorAssertionAuth` rejects invalid signature (401).
- `actorAssertionAuth` rejects expired claims (401).
- `actorAssertionAuth` attaches `req.auth` for valid token.
- `requirePerm` returns 403 when permission missing.
- `requirePerm` returns 403 with `missing` field.
- `requirePerm` calls next() when permission present.

```typescript
// apps/bridge/test/auth-middleware.test.ts — skeleton
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuthService } from "../src/services/auth/service.js";
import { actorAssertionAuth, requirePerm } from "../src/auth-middleware.js";
import { signAssertion } from "../src/services/auth/assertion.js";
import { config } from "../src/config.js";

// Tests should: set env AUTH_ASSERTION_SECRET='x'.repeat(32) before import OR use a mock.
// (Use vitest-free approach: spawn a subprocess with env, or patch config at runtime.)
// ... (spec details for implementer)
```

- [ ] Write tests in that style; run; commit.

```bash
git add apps/bridge/test/auth-middleware.test.ts
git commit -m "test(bridge): actor assertion middleware + requirePerm gating"
```

---

## Phase 4: Admin UI

Goal: full CRUD for users/roles, OIDC linking management, audit viewer, provider config display.

### Task 4.1: Admin layout + common action helpers

**Files:**
- Create: `apps/dashboard/src/app/admin/layout.tsx`
- Create: `apps/dashboard/src/app/admin/actions-common.ts`

- [ ] **Layout**

```tsx
// apps/dashboard/src/app/admin/layout.tsx
import { getEffectivePermissions } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

const ANY = ["auth.users.read","auth.roles.read","auth.providers.read","auth.audit.read"] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perms = await getEffectivePermissions();
  if (!ANY.some((p) => perms.includes(p))) redirect("/403");
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Administration</h1>
      {children}
    </div>
  );
}
```

- [ ] **actions-common (server action helpers)**

```typescript
// apps/dashboard/src/app/admin/actions-common.ts
"use server";
import { requirePermission } from "@/lib/auth/current-user";
import { revalidatePath } from "next/cache";
import type { PermissionId } from "@openclaw-manager/types";

export async function requirePermForAction(perm: PermissionId): Promise<{ sub: string; sid: string; username: string }> {
  const s = await requirePermission(perm);
  return { sub: s.user.id, sid: s.sid, username: s.user.username };
}
```

- [ ] Commit.

### Task 4.2: Users list + create

**Files:**
- Create: `apps/dashboard/src/app/admin/users/page.tsx`
- Create: `apps/dashboard/src/app/admin/users/new/page.tsx`
- Create: `apps/dashboard/src/app/admin/users/new/new-form.tsx`

```tsx
// apps/dashboard/src/app/admin/users/page.tsx
import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeListUsers } from "@/lib/auth/bridge-auth-client";
import { PermissionGate } from "@/components/permission-gate";

export default async function Page() {
  const s = await requirePermission("auth.users.read");
  const users = await bridgeListUsers(s.user.id, s.sid, s.user.username);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Users</h2>
        <PermissionGate perm="auth.users.write">
          <Link href="/admin/users/new" className="rounded-pill bg-primary py-2 px-4 text-sm text-white">New user</Link>
        </PermissionGate>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-sm text-text-muted">
            <th className="py-2">Username</th>
            <th>Display</th>
            <th>Email</th>
            <th>Status</th>
            <th>Roles</th>
            <th>Last login</th>
            <th>Local</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-dark-border text-sm">
              <td className="py-2 font-mono">{u.username}</td>
              <td>{u.displayName || ""}</td>
              <td>{u.email || ""}</td>
              <td>{u.status}</td>
              <td>{u.roleIds.join(", ")}</td>
              <td className="mono">{u.lastLoginAt?.slice(0, 16) ?? "—"}</td>
              <td>{u.hasLocalPassword ? "✓" : "—"}</td>
              <td><Link href={`/admin/users/${u.id}`} className="text-primary">Edit</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// apps/dashboard/src/app/admin/users/new/page.tsx
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeListRoles } from "@/lib/auth/bridge-auth-client";
import { NewForm } from "./new-form";

export default async function Page() {
  const s = await requirePermission("auth.users.write");
  const roles = await bridgeListRoles(s.user.id, s.sid, s.user.username);
  return <NewForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} />;
}
```

```tsx
// apps/dashboard/src/app/admin/users/new/new-form.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewForm({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [v, setV] = useState({ username: "", displayName: "", email: "", password: "", roleIds: [] as string[] });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    const { user } = await res.json();
    router.push(`/admin/users/${user.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      <input required placeholder="username" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3" />
      <input placeholder="display name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3" />
      <input type="email" placeholder="email (optional)" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3" />
      <input type="password" minLength={8} placeholder="password (≥ 8; blank = OIDC-only)" value={v.password}
        onChange={(e) => setV({ ...v, password: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3" />
      <fieldset className="space-y-1">
        <legend className="text-sm text-text-muted">Roles</legend>
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.roleIds.includes(r.id)}
              onChange={(e) => setV({
                ...v, roleIds: e.target.checked ? [...v.roleIds, r.id] : v.roleIds.filter((x) => x !== r.id),
              })} />
            {r.name}
          </label>
        ))}
      </fieldset>
      {err && <p className="text-sm text-danger">{err}</p>}
      <button type="submit" disabled={busy} className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50">
        {busy ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
```

- [ ] **Dashboard API routes proxying to bridge**

```typescript
// apps/dashboard/src/app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeCreateUser, bridgeListUsers } from "@/lib/auth/bridge-auth-client";

export async function GET(): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.read");
    return NextResponse.json({ users: await bridgeListUsers(s.user.id, s.sid, s.user.username) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    throw err;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const body = await req.json();
    const user = await bridgeCreateUser(s.user.id, s.sid, s.user.username, body);
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] Commit.

### Task 4.3: User edit page (roles + direct grants + password reset + linked identities)

**Files:**
- Create: `apps/dashboard/src/app/admin/users/[id]/page.tsx`
- Create: `apps/dashboard/src/app/admin/users/[id]/edit-form.tsx`
- Create: `apps/dashboard/src/app/admin/users/[id]/actions.ts`
- Create: `apps/dashboard/src/app/api/admin/users/[id]/route.ts`
- Create: `apps/dashboard/src/app/api/admin/users/[id]/reset-password/route.ts`
- Create: `apps/dashboard/src/app/api/admin/users/[id]/links/[providerKey]/[issuer]/[sub]/route.ts`

- [ ] **Server page**

```tsx
// apps/dashboard/src/app/admin/users/[id]/page.tsx
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeGetUser, bridgeListRoles } from "@/lib/auth/bridge-auth-client";
import { PERMISSION_REGISTRY, PERMISSION_CATEGORIES } from "@openclaw-manager/types";
import { EditForm } from "./edit-form";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await requirePermission("auth.users.read");
  const [user, roles] = await Promise.all([
    bridgeGetUser(s.user.id, s.sid, s.user.username, id),
    bridgeListRoles(s.user.id, s.sid, s.user.username),
  ]);
  const categories = PERMISSION_CATEGORIES.map((cat) => ({
    category: cat,
    items: Object.entries(PERMISSION_REGISTRY).filter(([, meta]) => meta.category === cat).map(([pid, meta]) => ({ id: pid, label: meta.label, description: meta.description })),
  }));
  return <EditForm user={user} roles={roles} categories={categories} canWrite={s.permissions.includes("auth.users.write")} />;
}
```

- [ ] **Edit form — sections: basics, status, roles, grants (permission matrix with allow/none/deny radio per permission), local password reset, linked identities (unlink)**

Structure (abbreviated — implementer fills form wiring):

```tsx
// apps/dashboard/src/app/admin/users/[id]/edit-form.tsx
"use client";
// Layout: 4 sections
//  1. Basics: displayName, email, status dropdown
//  2. Roles: checkbox list
//  3. Permissions: collapsible per-category, each permission row has three radios: Inherit | Allow | Deny
//     Inherit = no entry in user.grants
//     Allow   = { permissionId, kind: "allow" }
//     Deny    = { permissionId, kind: "deny" }
//  4. Linked identities: list with "Unlink" button per row
//  5. Local password reset: separate form — new password input + submit (only shown if canWrite)
// On save: PATCH /api/admin/users/[id] with { displayName, email, status, roleIds, grants }
// Disable every input if !canWrite
```

Produce the full code in this step — list-of-radios per permission is repetitive but mechanical:

```tsx
// apps/dashboard/src/app/admin/users/[id]/edit-form.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUserPublic, AuthRole, AuthGrant, PermissionId } from "@openclaw-manager/types";

type Cat = { category: string; items: Array<{ id: string; label: string; description: string }> };

function grantKind(grants: AuthGrant[], pid: PermissionId): "inherit" | "allow" | "deny" {
  const g = grants.find((x) => x.permissionId === pid);
  if (!g) return "inherit";
  return g.kind;
}

export function EditForm({ user, roles, categories, canWrite }: {
  user: AuthUserPublic; roles: AuthRole[]; categories: Cat[]; canWrite: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({
    displayName: user.displayName ?? "",
    email: user.email ?? "",
    status: user.status,
    roleIds: [...user.roleIds],
    grants: [...user.grants] as AuthGrant[],
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetPw, setResetPw] = useState("");

  function setGrant(pid: PermissionId, kind: "inherit" | "allow" | "deny"): void {
    setState((p) => {
      const next = p.grants.filter((g) => g.permissionId !== pid);
      if (kind !== "inherit") next.push({ permissionId: pid, kind });
      return { ...p, grants: next };
    });
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setErr(""); setBusy(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: state.displayName, email: state.email, status: state.status,
        roleIds: state.roleIds, grants: state.grants,
      }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    router.refresh();
  }

  async function resetPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPw }),
    });
    if (res.ok) { setResetPw(""); alert("Password reset. All sessions revoked."); }
    else alert((await res.json()).error || "failed");
  }

  async function unlink(providerKey: string, issuer: string, sub: string): Promise<void> {
    if (!confirm("Unlink this identity?")) return;
    await fetch(`/api/admin/users/${user.id}/links/${encodeURIComponent(providerKey)}/${encodeURIComponent(issuer)}/${encodeURIComponent(sub)}`, { method: "DELETE" });
    router.refresh();
  }

  const disabled = !canWrite;

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-xl font-semibold">{user.username}</h2>
        <label className="block text-sm text-text-muted">Display name
          <input value={state.displayName} onChange={(e) => setState({ ...state, displayName: e.target.value })} disabled={disabled}
            className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2" />
        </label>
        <label className="block text-sm text-text-muted">Email
          <input type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} disabled={disabled}
            className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2" />
        </label>
        <label className="block text-sm text-text-muted">Status
          <select value={state.status} onChange={(e) => setState({ ...state, status: e.target.value as any })} disabled={disabled}
            className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2">
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
        <fieldset>
          <legend className="text-sm text-text-muted">Roles</legend>
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={state.roleIds.includes(r.id)} disabled={disabled}
                onChange={(e) => setState({
                  ...state,
                  roleIds: e.target.checked ? [...state.roleIds, r.id] : state.roleIds.filter((x) => x !== r.id),
                })} />
              {r.name} {r.system ? <span className="text-xs text-text-muted">(system)</span> : null}
            </label>
          ))}
        </fieldset>
        <details>
          <summary className="cursor-pointer text-sm text-text-muted">Direct permissions (override roles)</summary>
          {categories.map((cat) => (
            <div key={cat.category} className="mt-4">
              <h3 className="text-sm font-semibold capitalize">{cat.category}</h3>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {cat.items.map((it) => {
                    const k = grantKind(state.grants, it.id as PermissionId);
                    return (
                      <tr key={it.id} className="border-t border-dark-border">
                        <td className="py-1 pr-2">{it.label}</td>
                        <td className="py-1 text-xs text-text-muted">{it.description}</td>
                        <td className="py-1">
                          {(["inherit","allow","deny"] as const).map((opt) => (
                            <label key={opt} className="ml-2 text-xs">
                              <input type="radio" name={`g-${it.id}`} checked={k === opt}
                                onChange={() => setGrant(it.id as PermissionId, opt)} disabled={disabled} /> {opt}
                            </label>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </details>
        {err && <p className="text-danger text-sm">{err}</p>}
        <button type="submit" disabled={busy || disabled} className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50">
          {busy ? "Saving..." : "Save"}
        </button>
      </form>

      {canWrite && (
        <form onSubmit={resetPassword} className="space-y-2 rounded border border-dark-border p-4">
          <h3 className="text-sm font-semibold">Reset password</h3>
          <p className="text-xs text-text-muted">Resetting revokes all active sessions for this user.</p>
          <input type="password" minLength={8} value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="new password"
            className="block w-full rounded border border-dark-border bg-dark px-4 py-2" />
          <button className="rounded-pill bg-warn py-1 px-3 text-xs text-dark">Reset</button>
        </form>
      )}

      <section>
        <h3 className="text-sm font-semibold">Linked identities</h3>
        {user.linkedIdentities.length === 0 ? <p className="text-xs text-text-muted">None.</p> : (
          <ul className="space-y-1">
            {user.linkedIdentities.map((id) => (
              <li key={`${id.providerKey}:${id.issuer}:${id.sub}`} className="flex items-center justify-between text-sm">
                <span className="mono">{id.providerKey} · {id.issuer} · {id.sub}</span>
                {canWrite && (
                  <button onClick={() => unlink(id.providerKey, id.issuer, id.sub)} className="text-danger text-xs">Unlink</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **API routes (dashboard) proxy to bridge**

```typescript
// apps/dashboard/src/app/api/admin/users/[id]/route.ts
import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeGetUser, bridgeUpdateUser, bridgeDeleteUser } from "@/lib/auth/bridge-auth-client";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.read");
    const { id } = await ctx.params;
    return NextResponse.json({ user: await bridgeGetUser(s.user.id, s.sid, s.user.username, id) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    throw err;
  }
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id } = await ctx.params;
    const body = await req.json();
    return NextResponse.json({ user: await bridgeUpdateUser(s.user.id, s.sid, s.user.username, id, body) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id } = await ctx.params;
    if (id === s.user.id) return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
    await bridgeDeleteUser(s.user.id, s.sid, s.user.username, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

```typescript
// apps/dashboard/src/app/api/admin/users/[id]/reset-password/route.ts
import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeResetPassword } from "@/lib/auth/bridge-auth-client";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id } = await ctx.params;
    const { newPassword } = await req.json();
    if (typeof newPassword !== "string") return NextResponse.json({ error: "newPassword required" }, { status: 400 });
    await bridgeResetPassword(s.user.id, s.sid, s.user.username, id, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

```typescript
// apps/dashboard/src/app/api/admin/users/[id]/links/[providerKey]/[issuer]/[sub]/route.ts
import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeUnlinkOidc } from "@/lib/auth/bridge-auth-client";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; providerKey: string; issuer: string; sub: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id, providerKey, issuer, sub } = await ctx.params;
    await bridgeUnlinkOidc(s.user.id, s.sid, s.user.username, id, providerKey, decodeURIComponent(issuer), sub);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] Commit.

### Task 4.4: Roles list + create + edit

**Files:**
- Create: `apps/dashboard/src/app/admin/roles/page.tsx`
- Create: `apps/dashboard/src/app/admin/roles/new/page.tsx`
- Create: `apps/dashboard/src/app/admin/roles/new/new-form.tsx`
- Create: `apps/dashboard/src/app/admin/roles/[id]/page.tsx`
- Create: `apps/dashboard/src/app/admin/roles/[id]/edit-form.tsx`
- Create: `apps/dashboard/src/app/api/admin/roles/route.ts`
- Create: `apps/dashboard/src/app/api/admin/roles/[id]/route.ts`

Role edit uses the same categorized permission matrix as user-edit but only `Allow` vs `Not-included` (no deny at role level). System roles render read-only with a badge.

- [ ] Implement pages + API routes following the user-edit patterns; commit.

### Task 4.5: Providers page (read-only in v1)

**Files:**
- Create: `apps/dashboard/src/app/admin/auth/page.tsx`

```tsx
// apps/dashboard/src/app/admin/auth/page.tsx
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeGetProviders } from "@/lib/auth/bridge-auth-client";

export default async function Page() {
  const s = await requirePermission("auth.providers.read");
  const { oidc } = await bridgeGetProviders(s.user.id, s.sid, s.user.username) as { oidc: any };
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Auth providers</h2>
      {oidc ? (
        <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">
          <dt>Provider key</dt><dd className="mono">{oidc.key}</dd>
          <dt>Display name</dt><dd>{oidc.displayName}</dd>
          <dt>Issuer</dt><dd className="mono">{oidc.issuerUrl}</dd>
          <dt>Redirect URI</dt><dd className="mono">{oidc.redirectUri}</dd>
          <dt>Scopes</dt><dd className="mono">{oidc.scopes.join(" ")}</dd>
          <dt>Auto-provision</dt><dd>{oidc.autoProvision ? "on" : "off"}</dd>
        </dl>
      ) : <p className="text-sm text-text-muted">OIDC is not configured. Set <code>AUTH_OIDC_*</code> env vars and restart the bridge.</p>}
    </div>
  );
}
```

- [ ] Commit.

### Task 4.6: Audit page

**Files:**
- Create: `apps/dashboard/src/app/admin/audit/page.tsx`

```tsx
// apps/dashboard/src/app/admin/audit/page.tsx
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeTailAudit } from "@/lib/auth/bridge-auth-client";

export default async function Page(props: { searchParams: Promise<{ limit?: string }> }) {
  const s = await requirePermission("auth.audit.read");
  const { limit } = await props.searchParams;
  const n = Math.max(1, Math.min(Number(limit) || 100, 500));
  const entries = await bridgeTailAudit(s.user.id, s.sid, s.user.username, n);
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Audit log</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted">
            <th>Time</th><th>Kind</th><th>Actor</th><th>Target</th><th>Meta</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-t border-dark-border align-top">
              <td className="mono text-xs">{e.at.slice(0, 19)}</td>
              <td className="mono text-xs">{e.kind}</td>
              <td className="text-xs">{e.actorUsername ?? e.actorUserId ?? "—"}</td>
              <td className="text-xs">{e.targetUsername ?? e.targetUserId ?? "—"}</td>
              <td className="text-xs"><code>{e.meta ? JSON.stringify(e.meta) : ""}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Commit.

### Task 4.7: Build + smoke

```bash
cd apps/bridge && pnpm build && pnpm test
cd ../.. && pnpm --filter dashboard build
```

Manual smoke: log in as admin, create user, assign role, reset password, toggle disabled, view audit, view providers.

---

## Phase 5: OIDC (dashboard wiring)

Goal: dashboard routes for OIDC start + callback + self-service linking after unlinked login.

Bridge already implements `/auth/oidc/start`, `/auth/oidc/callback`, `/auth/link-oidc/complete`, and the helpers in P1. Phase 5 only wires the dashboard side.

### Task 5.1: Dashboard `/api/auth/oidc/start`

**Files:**
- Create: `apps/dashboard/src/app/api/auth/oidc/start/route.ts`

```typescript
// apps/dashboard/src/app/api/auth/oidc/start/route.ts
import { NextResponse } from "next/server";
import { bridgeOidcStart } from "@/lib/auth/bridge-auth-client";

export async function POST(req: Request): Promise<NextResponse> {
  const { returnTo } = await req.json().catch(() => ({}));
  try {
    const r = await bridgeOidcStart(typeof returnTo === "string" ? returnTo : undefined);
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "oidc_unavailable" }, { status: 404 });
  }
}
```

- [ ] Commit.

### Task 5.2: Dashboard `/api/auth/oidc/callback`

**Files:**
- Create: `apps/dashboard/src/app/api/auth/oidc/callback/route.ts`

This endpoint is the provider's `redirect_uri`. The dashboard receives `?code=...&state=...`, forwards the full URL to the bridge, and handles the two outcomes:

```typescript
// apps/dashboard/src/app/api/auth/oidc/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { bridgeOidcCallback } from "@/lib/auth/bridge-auth-client";
import { setSidCookie } from "@/lib/auth/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const fullUrl = req.nextUrl.toString();
  try {
    const r = await bridgeOidcCallback(fullUrl);
    if (r.kind === "logged_in") {
      await setSidCookie(r.sessionId, r.expiresAt);
      const target = new URL(r.returnTo && r.returnTo.startsWith("/") ? r.returnTo : "/", req.url);
      return NextResponse.redirect(target);
    }
    // unlinked: send user to login with context so they can sign in locally and link.
    const params = new URLSearchParams({
      oidc_unlinked: "1",
      issuer: r.issuer,
      sub: r.sub,
      ...(r.email ? { email: r.email } : {}),
    });
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url));
  } catch {
    return NextResponse.redirect(new URL("/login?oidc_error=1", req.url));
  }
}
```

- [ ] Commit.

### Task 5.3: Self-service link flow (post local login)

**Files:**
- Create: `apps/dashboard/src/app/link-identity/page.tsx`
- Create: `apps/dashboard/src/app/link-identity/link-form.tsx`
- Create: `apps/dashboard/src/app/api/auth/link-oidc/complete/route.ts`

Flow:
1. User completes OIDC and is redirected back to `/login?oidc_unlinked=1&issuer=...&sub=...&email=...`.
2. Login page shows the warning banner (implemented in P2 Task 2.6).
3. After local login, login success redirect inspects the `oidc_unlinked` carry-over via localStorage: when the login form submits, if `oidc_unlinked=1` was in the original URL, the form stashes `{issuer, sub, email}` in `sessionStorage` under `ocm_pending_link` and — on success — navigates to `/link-identity` instead of `/`.
4. `/link-identity` reads `sessionStorage`, shows a confirm button, calls `/api/auth/link-oidc/complete`, clears `sessionStorage`.

Client-side adjustment to login form (Task 2.6):

```tsx
// inside submit() on successful login, before router.push:
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("oidc_unlinked") === "1" && params.get("issuer") && params.get("sub")) {
    try {
      sessionStorage.setItem("ocm_pending_link", JSON.stringify({
        issuer: params.get("issuer"),
        sub: params.get("sub"),
        email: params.get("email") ?? undefined,
      }));
      router.push("/link-identity");
      return;
    } catch {}
  }
}
router.push(redirect || "/");
```

Page:

```tsx
// apps/dashboard/src/app/link-identity/page.tsx
import { requireAuth } from "@/lib/auth/current-user";
import { LinkForm } from "./link-form";

export default async function Page() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-4 text-2xl font-semibold">Link external identity</h1>
      <LinkForm />
    </div>
  );
}
```

```tsx
// apps/dashboard/src/app/link-identity/link-form.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function LinkForm() {
  const router = useRouter();
  const [claim, setClaim] = useState<{ issuer: string; sub: string; email?: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ocm_pending_link");
      if (raw) setClaim(JSON.parse(raw));
    } catch {}
  }, []);

  async function link(): Promise<void> {
    if (!claim) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/auth/link-oidc/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerKey: "default", ...claim }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    try { sessionStorage.removeItem("ocm_pending_link"); } catch {}
    router.push("/");
  }

  if (!claim) return <p className="text-sm text-text-muted">No pending identity to link. Return to <a href="/" className="text-primary">overview</a>.</p>;
  return (
    <div className="space-y-4 text-sm">
      <p>You signed in with an external identity that was not linked to your account. Confirm to link it now:</p>
      <dl className="rounded border border-dark-border p-3">
        <dt className="text-xs text-text-muted">Issuer</dt><dd className="mono">{claim.issuer}</dd>
        <dt className="text-xs text-text-muted">Subject</dt><dd className="mono">{claim.sub}</dd>
        {claim.email && (<><dt className="text-xs text-text-muted">Email</dt><dd>{claim.email}</dd></>)}
      </dl>
      {err && <p className="text-danger text-sm">{err}</p>}
      <button onClick={link} disabled={busy} className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50">
        {busy ? "Linking..." : "Link identity"}
      </button>
    </div>
  );
}
```

```typescript
// apps/dashboard/src/app/api/auth/link-oidc/complete/route.ts
import { NextResponse } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeLinkOidcComplete } from "@/lib/auth/bridge-auth-client";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    const body = await req.json();
    if (typeof body?.providerKey !== "string" || typeof body?.issuer !== "string" || typeof body?.sub !== "string") {
      return NextResponse.json({ error: "providerKey, issuer, sub required" }, { status: 400 });
    }
    await bridgeLinkOidcComplete(s.user.id, s.sid, s.user.username, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] Commit.

### Task 5.4: WS ticket route + client swap

**Files:**
- Create: `apps/dashboard/src/app/api/auth/ws-ticket/route.ts`
- Update: any client that opens a WS to the bridge

```typescript
// apps/dashboard/src/app/api/auth/ws-ticket/route.ts
import { NextResponse } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeIssueWsTicket } from "@/lib/auth/bridge-auth-client";

export async function POST(): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    return NextResponse.json(await bridgeIssueWsTicket(s.user.id, s.sid));
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Update dashboard WS client** — search `apps/dashboard/src` for anywhere the dashboard opens a WS connection to the bridge (today, URL typically includes `?token=...`). Replace with: fetch `/api/auth/ws-ticket` → open `wss://.../ws?ticket=<t>`.

```bash
grep -rn "/ws?" apps/dashboard/src
```

Fix each occurrence.

- [ ] Commit.

---

## Phase 6: Migration, docs, and final cleanup

### Task 6.1: `.env.example` update

**Files:**
- Modify: `.env.example`

Replace the Dashboard section and add Auth section. Full new contents:

```
# Bridge
BRIDGE_HOST=192.168.0.50
BRIDGE_PORT=3100
BRIDGE_TOKEN=changeme
OPENCLAW_STATE_PATH=C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\whatsapp-auto-reply-state.json
MANAGEMENT_DIR=C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\management
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=changeme

# Dashboard
OPENCLAW_BRIDGE_URL=http://192.168.0.50:3100
OPENCLAW_BRIDGE_TOKEN=changeme

# --- Auth ---
# Shared HMAC secret used by the dashboard to sign actor assertions and by the
# bridge to verify them. MUST be at least 32 random characters. Generate with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
AUTH_ASSERTION_SECRET=generate-a-long-random-string-at-least-32-chars

# First-run bootstrap token. Create the initial admin by POSTing
# { token, username, password } to /auth/bootstrap (dashboard form: /bootstrap).
# After first user exists this endpoint returns 403 forever.
AUTH_BOOTSTRAP_TOKEN=change-me-once-then-rotate

# Optional session tuning.
AUTH_SESSION_TTL_MS=604800000           # 7 days
AUTH_SESSION_LASTSEEN_THROTTLE_MS=60000 # 1 minute
AUTH_WS_TICKET_TTL_MS=60000             # 60 seconds

# --- Legacy migration (REMOVE after first real user is created) ---
# If set AND users.json is empty, login accepts this password once and creates
# an `admin` user inline with a loud audit entry. After that this var is ignored.
ADMIN_PASSWORD=changeme

# --- OIDC (optional; leave blank to disable) ---
AUTH_OIDC_ISSUER_URL=
AUTH_OIDC_CLIENT_ID=
AUTH_OIDC_CLIENT_SECRET=
AUTH_OIDC_REDIRECT_URI=https://your-dashboard/api/auth/oidc/callback
AUTH_OIDC_SCOPES=openid email profile
AUTH_OIDC_PROVIDER_NAME=Single Sign-On
AUTH_OIDC_PROVIDER_KEY=default
# Create a new local user automatically on first OIDC login? Default false (manual link required).
AUTH_OIDC_AUTO_PROVISION=false
```

- [ ] Commit: `docs: .env.example — document AUTH_* and AUTH_OIDC_* vars`.

### Task 6.2: Bootstrap / migration docs

**Files:**
- Create: `docs/AUTH.md`

Contents (Markdown; implementer copies verbatim):

```markdown
# Auth setup

OpenClaw Manager supports local username/password and OIDC (one generic provider) backed by file-stored users under `MANAGEMENT_DIR/auth/`.

## First-run bootstrap

1. Set `AUTH_ASSERTION_SECRET` to a long random value (≥ 32 chars). Required on both bridge and dashboard processes.
2. Set `AUTH_BOOTSTRAP_TOKEN` to a secret you'll use only once to create the initial admin.
3. Start the bridge, then the dashboard. Visit the dashboard. You'll be redirected to `/bootstrap`.
4. Enter the bootstrap token, a username, and a password (≥ 8 chars). This creates an `admin`-role user and immediately signs you in.
5. Rotate `AUTH_BOOTSTRAP_TOKEN` (or remove it). The endpoint returns 403 after first user exists.

## Legacy migration from `ADMIN_PASSWORD`

If you're upgrading an installation that used `ADMIN_PASSWORD`:

- Leave `ADMIN_PASSWORD` set until you complete first login.
- Visit `/login`. Enter your old password in the username=`admin` / password=`<old>` form. The bridge detects empty `users.json`, verifies against the env var, creates a persistent `admin` user, records a `bootstrap.legacy_migration` audit entry, and logs you in.
- **Remove `ADMIN_PASSWORD` from your env and restart.** After any user exists it is permanently ignored.

## Adding users

1. Sign in as admin.
2. Navigate to `/admin/users`.
3. Click "New user". Fill username, optional display name/email, optional password (leave blank for OIDC-only), and assign roles.
4. Edit the user to tweak direct permissions (override role grants with allow/deny per permission).

## System roles (cannot be deleted; grants are not editable)

- `admin` — all permissions.
- `auth-admin` — user/role/provider/session/audit management.
- `operator` — day-to-day operations (read + most mutations).
- `viewer` — read-only across all features.

## Custom roles

Create via `/admin/roles`. Role grants are `allow`-only. User-level grants may override with `deny`.

## OIDC

1. Register an OIDC client at your IdP. Configure its redirect URI to `https://<your-dashboard>/api/auth/oidc/callback`.
2. Set `AUTH_OIDC_ISSUER_URL`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_REDIRECT_URI`. Leave any of them blank to disable OIDC entirely.
3. Restart the bridge.
4. The login page now shows a "Sign in with <provider>" button.

### Linking strategy

- Default (`AUTH_OIDC_AUTO_PROVISION=false`): OIDC login with no linked identity redirects back to `/login` with a banner. Sign in locally, then confirm the link on `/link-identity`.
- `AUTH_OIDC_AUTO_PROVISION=true`: first OIDC login creates a new local user (no password) automatically. Do not enable unless your IdP restricts the audience to trusted users.

## Session behavior

- Opaque 32-byte `ocm_sid` cookie; HttpOnly; Secure in production; SameSite=Strict.
- Default TTL: 7 days. Idle update (`lastSeenAt`) throttled to 60 s.
- Logout, admin disable, and admin password reset all revoke sessions.
- `/admin/audit` shows login attempts, password changes, role changes, OIDC events, bootstrap events.

## Architecture summary

- Bridge is the sole authorization authority. All permissions are re-resolved on every `/auth/session/resolve` call.
- Dashboard holds no persistent auth state. It signs a short-lived (60 s) HMAC assertion on every bridge call via `x-ocm-actor`.
- WebSocket auth uses single-use tickets minted by `/auth/ws-ticket`, valid for 60 s.
- Audit log is append-only JSONL at `MANAGEMENT_DIR/auth/audit.jsonl`.
```

- [ ] Commit: `docs: AUTH.md — bootstrap, migration, OIDC, role model, session behavior`.

### Task 6.3: Remove the WS bearer path

After P5 lands and all dashboard WS clients use tickets, drop the `?token=` fallback.

**Files:**
- Modify: `apps/bridge/src/ws.ts`

```typescript
// apps/bridge/src/ws.ts — inside connection handler
if (!ticket) { ws.close(4001, "Unauthorized"); return; }
const claim = await authService.consumeWsTicket(ticket);
if (!claim) { ws.close(4001, "Unauthorized"); return; }
```

Remove the `bearer` branch and the `config` import if that was the only user.

- [ ] Commit: `refactor(bridge): require WS ticket (drop legacy ?token= fallback)`.

### Task 6.4: Final cleanup

- [ ] **Remove any dangling `ADMIN_PASSWORD` usage** in code. Bridge keeps `config.authLegacyAdminPassword` but that's the only read site (inside the service). Dashboard must not read it directly.
- [ ] **Drop the "strict:false" comment** in `server.ts` now that it's strict.
- [ ] **Delete any leftover `isAuthenticated` import shims** found in the repo.
- [ ] **Remove `apps/dashboard/src/lib/session.ts`** if any stale reference remains (should already be gone in P2 Task 2.5).
- [ ] **Run the full build:**

```bash
pnpm build
cd apps/bridge && pnpm test
```

All green.

- [ ] **Manual verification checklist** (see §Verification below).

- [ ] Commit: `chore: final auth-rewrite cleanup`.

### Task 6.5: Verification (run before declaring Phase 6 complete)

Run through this checklist on a fresh `MANAGEMENT_DIR` and on an existing one with legacy `ADMIN_PASSWORD`.

**Fresh install:**
- [ ] Visit dashboard → redirects to `/bootstrap`.
- [ ] Submit bootstrap token + credentials → logged in.
- [ ] `/admin/users` shows the created admin.
- [ ] Create a viewer-role user; log out; log in as viewer; confirm sidebar only shows read-only items; confirm `/admin/users` returns 403.
- [ ] Disable viewer user while logged in on a second browser → next request lands on `/login`.
- [ ] Change password page works; after change, old password fails.

**Legacy migration:**
- [ ] With empty users and `ADMIN_PASSWORD=legacy` set, log in at `/login` with username=`admin` password=`legacy` → logged in; audit shows `bootstrap.legacy_migration`.
- [ ] Unset `ADMIN_PASSWORD` and restart → legacy login no longer accepted.

**OIDC (if configured):**
- [ ] Click "Sign in with SSO" → redirected to IdP → consent → land back, logged in (if linked) OR see unlinked banner (if not).
- [ ] Unlinked flow: sign in locally, confirm `/link-identity`, re-run OIDC → logged in successfully.
- [ ] `/admin/users/:id` shows the linked identity; unlink button works.

**Authorization:**
- [ ] Attempt unauthorized conversation takeover from the JSON API → 403 response with `{ error: "forbidden", missing: "conversations.takeover" }`.
- [ ] Attempt unauthorized page (e.g. `/admin/users` as viewer) → redirect to `/403`.
- [ ] WebSocket connects with valid ticket; fails when ticket reused.

---

## Self-Review

Before handing to the subagent-driven-development executor, verify the plan against the spec:

1. **OIDC + local + local admin**: all covered — P1 service, P2 login page, P5 dashboard wiring.
2. **Fine-grained permissions per feature**: 65+ permissions in registry (Task 1.2); every route/page/action in P3 has an assigned permission.
3. **Secure session management**: opaque 32-byte sid, HttpOnly + Secure + SameSite=Strict; server-side store; revocation paths (admin disable, password reset, admin revoke, logout).
4. **Authorization enforcement across pages/routes/actions/UI**: Templates A–E in Task 3.2; tables across 3.3–3.11 enumerate every file.
5. **File-based persistence**: all auth state under `MANAGEMENT_DIR/auth/`; `atomic-file.ts` helpers mandatory post-P1.
6. **Reverse-proxy-safe redirects**: preserved in Task 2.3 middleware (uses x-forwarded-host/proto).
7. **Telemetry + action attribution**: Task 2.10 replaces hardcoded "admin"/"anon" with resolved user id.
8. **Admin UI coverage**: users (Task 4.2/4.3), roles (4.4), providers (4.5), audit (4.6). Direct per-user grants UI in Task 4.3.
9. **Bootstrap safety**: explicit `AUTH_BOOTSTRAP_TOKEN` + one-shot `ADMIN_PASSWORD` migration; audit entry for both; both return 403 after first user.
10. **Tests**: Phase 1 covers hashing, session store, store, permissions, assertion, audit, ws-ticket, service, OIDC helpers, routes; Phase 3 adds middleware + enforcement tests.

**Known risks / follow-ups not in scope:**
- Rate limiting on `/auth/login` and `/auth/bootstrap`. Worth adding but not in this plan.
- CSRF protection beyond SameSite=Strict: dashboard is same-origin, cookies are Strict; we rely on that. If cross-origin usage ever appears, add explicit CSRF tokens on mutating routes.
- WebSocket per-event permission filtering (broadcasts are still global). Foundation is in place (connection knows user) but filtering deferred.
- OIDC multi-provider registry. Env-config single provider covers the spec's "at least one generic OIDC provider" requirement; multi-provider can build on the same `providerKey` machinery.
- Session cookie rotation after login (fixation): session id is minted fresh on login, so this is already safe.
- Password strength policy beyond length ≥ 8. Consider zxcvbn or similar in a follow-up.

## Execution Handoff

This plan is large and independent-per-phase. Execute with `superpowers:subagent-driven-development`:

1. Fresh implementer subagent per Task (e.g. 1.1, 1.2, …). Hand each the task text + any referenced file content.
2. After each task: spec-compliance review subagent → code-quality review subagent → mark complete.
3. Do not start Task N+1 until reviewers approve N.
4. After Phase N: run `cd apps/bridge && pnpm build && pnpm test` and `pnpm --filter dashboard build` before starting Phase N+1.
5. Before merging to `main`: dispatch a full-branch `code-reviewer` subagent and address its findings.


