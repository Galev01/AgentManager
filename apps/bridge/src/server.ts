import express, { type Express } from "express";
import { config } from "./config.js";
import { bearerAuth } from "./auth.js";
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use(bearerAuth);
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
app.use(
  createTelemetryRouter({
    dir: config.telemetryDir,
    retentionDays: config.telemetryRetentionDays,
    maxDiskMB: config.telemetryMaxDiskMB,
  })
);

const server = app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});

attachWebSocket(server);

void (async () => {
  try { await repairOnStartup(); } catch (e) { console.warn("reviewer repair failed:", e); }
  try { await scanProjects(); } catch (e) { console.warn("reviewer scan failed:", e); }
  try { await repairYoutubeOnStartup(); } catch (e) { console.warn("youtube repair failed:", e); }
  // TODO: chat-worker startup repair — no hook yet
})();

export { app, server };
