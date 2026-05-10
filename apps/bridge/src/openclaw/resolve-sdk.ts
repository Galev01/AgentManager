import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

export interface ResolveSdkOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  globalNpmRoot?: () => string;
  warn?: (msg: string) => void;
}

export type ResolveSource =
  | "env-override"
  | "workspace-package"
  | "workspace-glob"
  | "global-fallback";

export interface ResolveSdkResult {
  path: string;
  source: ResolveSource;
}

const ENV_VAR = "OPENCLAW_SDK_PATH";
const SETUP_HINT =
  "Could not resolve OpenClaw SDK.\n" +
  "  Install in this workspace:  pnpm --filter bridge add openclaw\n" +
  `  Or set ${ENV_VAR}=/abs/path/to/dist/call-*.js`;

const requireFromHere = createRequire(import.meta.url);

export function resolveSdkPath(opts: ResolveSdkOptions = {}): ResolveSdkResult {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const warn = opts.warn ?? ((m: string) => console.warn(m));

  // 1. Env override.
  const override = env[ENV_VAR];
  if (override && fs.existsSync(override)) {
    return { path: override, source: "env-override" };
  }

  // 2. Stable package entry.
  try {
    const pkgJson = requireFromHere.resolve("openclaw/package.json", { paths: [cwd] });
    const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
    if (pkg.exports || pkg.main) {
      const dir = path.dirname(pkgJson);
      const main = typeof pkg.main === "string" ? pkg.main : "dist/index.js";
      const stable = path.resolve(dir, main);
      if (fs.existsSync(stable)) {
        return { path: stable, source: "workspace-package" };
      }
    }
  } catch {
    // not installed locally with stable export — fall through
  }

  // 3. Workspace glob fallback for hash-versioned bundles.
  const localGlob = globCallStar(path.join(cwd, "node_modules", "openclaw", "dist"));
  if (localGlob) return { path: localGlob, source: "workspace-glob" };

  // 4. Global npm root glob — emit warning.
  const globalRootFn = opts.globalNpmRoot ?? defaultGlobalNpmRoot;
  let globalRoot: string;
  try {
    globalRoot = globalRootFn();
  } catch {
    globalRoot = "";
  }
  if (globalRoot) {
    const globalGlob = globCallStar(path.join(globalRoot, "openclaw", "dist"));
    if (globalGlob) {
      warn(
        `[openclaw] Resolved SDK from global npm install at ${globalGlob}. ` +
          "This is a transitional fallback. Prefer a workspace dependency or set " +
          `${ENV_VAR}.`,
      );
      return { path: globalGlob, source: "global-fallback" };
    }
  }

  throw new Error(SETUP_HINT);
}

function globCallStar(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  const matches = entries
    .filter((e) => /^call-[^/\\]+\.js$/.test(e))
    .map((e) => path.join(dir, e))
    .sort();
  return matches[0] ?? null;
}

function defaultGlobalNpmRoot(): string {
  return execSync("npm root -g", { encoding: "utf8" }).trim();
}
