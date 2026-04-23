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
- Visit `/login`. Enter username `admin` and your old password. The bridge detects empty `users.json`, verifies against the env var, creates a persistent `admin` user, records a `bootstrap.legacy_migration` audit entry, and logs you in.
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
