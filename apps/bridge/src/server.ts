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
import { createRuntimeRegistry } from "./services/runtimes/registry.js";
import { realFactories } from "./services/runtimes/factories.js";
import { createRuntimesRouter } from "./routes/runtimes.js";
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

// Public /auth/* requires service bearer only.
app.use(bearerAuth);
app.use(createPublicAuthRouter(authService));

// Claude Code MCP bridge: headless agent traffic carves identity from the
// request body (ide/workspace/clientId). Actor assertion is optional so the
// stdio MCP can talk without a user session; dashboard callers still sign and
// req.auth is populated when they do.
app.use(actorAssertionAuth(authService, { strict: false }), claudeCodeRouter);

// Strict actor assertion required for authenticated routes.
app.use(actorAssertionAuth(authService, { strict: true }));
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
app.use(createTelemetryRouter({
  dir: config.telemetryDir,
  retentionDays: config.telemetryRetentionDays,
  maxDiskMB: config.telemetryMaxDiskMB,
}));

// Multi-runtime control plane. Mounted AFTER strict actor-assertion so
// req.auth is populated before the router's requirePerm gate runs, and so the
// bridge can stamp humanActorUserId from req.auth.user.id instead of trusting
// the request body.
const runtimeRegistry = await createRuntimeRegistry({
  configPath: config.runtimesConfigPath,
  factories: realFactories,
});
app.use(createRuntimesRouter({
  registry: runtimeRegistry,
  managerServiceId: process.env.BRIDGE_SERVICE_ID ?? "bridge-primary",
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
