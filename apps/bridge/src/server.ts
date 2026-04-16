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

const server = app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});

attachWebSocket(server);

export { app, server };
