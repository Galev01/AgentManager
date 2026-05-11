/**
 * Next.js `output: "standalone"` does not copy `.next/static` or `public` into
 * the standalone folder. Without this step, HTML loads but CSS/JS/fonts 404.
 *
 * Run automatically after `next build` via package.json "build" script.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, "..");
const standaloneServer = path.join(
  dashboardRoot,
  ".next",
  "standalone",
  "apps",
  "dashboard",
  "server.js",
);

if (!fs.existsSync(standaloneServer)) {
  console.log(
    "[copy-standalone-assets] standalone server.js not found — skipping (non-standalone build?)",
  );
  process.exit(0);
}

const standDir = path.dirname(standaloneServer);
const staticSrc = path.join(dashboardRoot, ".next", "static");
const staticDst = path.join(standDir, ".next", "static");
const pubSrc = path.join(dashboardRoot, "public");
const pubDst = path.join(standDir, "public");

if (!fs.existsSync(staticSrc)) {
  console.error("[copy-standalone-assets] missing", staticSrc);
  process.exit(1);
}

fs.mkdirSync(path.dirname(staticDst), { recursive: true });
fs.cpSync(staticSrc, staticDst, { recursive: true, force: true });
console.log("[copy-standalone-assets] copied .next/static → standalone");

if (fs.existsSync(pubSrc)) {
  fs.cpSync(pubSrc, pubDst, { recursive: true, force: true });
  console.log("[copy-standalone-assets] copied public → standalone");
} else {
  console.log("[copy-standalone-assets] no public/ dir, skipping");
}
