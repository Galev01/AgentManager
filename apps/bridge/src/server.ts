import express, { type Express } from "express";
import { config } from "./config.js";
import { bearerAuth } from "./auth.js";

const app: Express = express();
app.use(express.json());

// Health endpoint is unauthenticated
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// All other routes require auth
app.use(bearerAuth);

app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});

export { app };
