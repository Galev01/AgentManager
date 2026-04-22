/**
 * Dashboard-side narrative copy for the gateway configuration.
 *
 * The gateway's JSON Schema is intentionally structural only (no `description`,
 * `title`, `examples`, `default`). Every bit of operator-facing copy lives
 * here so we can evolve the language without chasing the Go side.
 *
 * Keyed by:
 *   - `sections`: top-level key (e.g. "logging")
 *   - `fields`:   dotted path from root (e.g. "logging.redactSensitive")
 */

export type ConfigSectionCopy = {
  /** Operator-facing header. Overrides auto-capitalization of the key name. */
  title: string;
  /** One-sentence plain-English summary. Shown directly under the header. */
  summary: string;
  /** 1-3 sentences of operator guidance. Rendered as a paragraph. */
  whatItControls?: string;
  /** Bullet-point caveats/warnings. Rendered amber-ish. */
  notes?: string[];
};

export type ConfigFieldCopy = {
  /** Override the auto-label derived from the key name. */
  label?: string;
  /** Longer explanation shown in the inspector panel. */
  description?: string;
  /** Sample value shown in inspector (rendered as code). */
  example?: string;
  /** Which part of OpenClaw uses this (e.g. "gateway", "agent runtime"). */
  subsystem?: string;
};

export type ConfigCopy = {
  sections: Record<string, ConfigSectionCopy>;
  fields: Record<string, ConfigFieldCopy>;
};

export const CONFIG_COPY: ConfigCopy = {
  sections: {
    meta: {
      title: "Meta",
      summary: "Bookkeeping — last-touched version and timestamp.",
      whatItControls:
        "Updated automatically when the gateway or CLI writes config. Not meant for manual editing. Safe to ignore unless debugging version mismatches.",
    },
    env: {
      title: "Environment",
      summary:
        "Shell environment capture and literal env var injection for agents.",
      whatItControls:
        "`shellEnv.enabled` lets agents inherit your shell's env (with a timeout). `vars` lets you hard-code values without affecting your shell. Additional top-level keys become literal string env vars.",
    },
    wizard: {
      title: "Wizard",
      summary: "Setup wizard state — last run metadata.",
      whatItControls:
        "Populated by `openclaw setup`. Don't hand-edit; use the wizard instead.",
    },
    diagnostics: {
      title: "Diagnostics",
      summary:
        "Debug flags, stuck-session detection, OTEL export, cache tracing.",
      whatItControls:
        "Turn on OTEL for production tracing. Cache trace dumps LLM cache hits/misses to a file for performance investigation. `stuckSessionWarnMs` triggers a warning log when an agent session is idle too long.",
    },
    logging: {
      title: "Logging",
      summary:
        "Gateway log level, file rotation, console style, redaction rules.",
      whatItControls:
        "`level` controls everything that goes to disk; `consoleLevel` is separate so you can run verbose in the terminal while keeping the file clean. `redactSensitive: \"tools\"` scrubs tool arguments/results in logs — recommended for shared machines. `redactPatterns` adds regex-based redaction.",
    },
    cli: {
      title: "CLI",
      summary: "Cosmetic CLI options (banner tagline mode).",
      whatItControls:
        "Only affects the `openclaw` terminal client. Safe to leave at defaults.",
    },
    update: {
      title: "Update",
      summary:
        "Self-update channel (stable/beta/dev) and auto-update timing.",
      whatItControls:
        "`channel` picks which release track you follow. `auto.enabled` lets OpenClaw self-update in the background. `stableDelayHours` and `stableJitterHours` spread update load across fleets. `beta` checks more aggressively.",
    },
    browser: {
      title: "Browser",
      summary:
        "Chromium/CDP control — profiles, SSRF policy, headless mode, executable path.",
      whatItControls:
        "OpenClaw drives a browser via CDP for web-capable tools. `profiles` map lets you define multiple named browser profiles (different user-data dirs, ports, colors). `ssrfPolicy.allowPrivateNetwork` is needed for local development but is a security footgun in prod. `executablePath` lets you point at a specific Chrome/Chromium binary.",
      notes: [
        "Enabling `ssrfPolicy.allowPrivateNetwork` lets agents hit LAN and loopback addresses. Only enable for trusted local development.",
      ],
    },
    ui: {
      title: "UI",
      summary: "Dashboard and assistant cosmetics (seam color, name, avatar).",
      whatItControls:
        "`seamColor` is the hex color used for the UI accent. `assistant.name` and `assistant.avatar` are shown in the chat UI. Cosmetic only — no runtime impact.",
    },
    secrets: {
      title: "Secrets",
      summary: "Secret provider configuration — where secrets come from.",
      whatItControls:
        "Providers are pluggable; the most common is `source: \"env\"` with an allowlist of uppercase env var names. Secret references (`$secret(provider:name)`) resolve through these providers at runtime. Keep the allowlist tight to limit what agents can read.",
      notes: [
        "Secret values are never written to config; only references and provider configuration.",
      ],
    },
    agents: {
      title: "Agents",
      summary: "Agent defaults and per-agent overrides.",
      whatItControls:
        "`defaults` sets the baseline model, workspace, and compaction policy. `models` is a map of known model aliases. `list` is the agents Gal has configured (main, reviewer, claude-code, etc.) — each can override workspace, model, or agentDir.",
    },
    models: {
      title: "Models",
      summary:
        "LLM provider catalog (OpenRouter, Ollama, OpenAI-Codex) with cost/context metadata.",
      whatItControls:
        "`providers.{name}` declares an API endpoint (OpenAI-completions, Ollama, etc.), an API key (often a secret reference), and a `models` array describing each model's context window, max tokens, cost per token, and whether it supports reasoning. Only models declared here are usable by agents.",
    },
  },

  fields: {
    // env
    "env.shellEnv.enabled": {
      label: "Inherit shell env",
      description:
        "When on, agents inherit environment variables from your interactive shell. Useful for picking up API keys exported in your profile. Disable on shared machines to keep agent env lean.",
      example: "true",
    },
    "env.shellEnv.timeoutMs": {
      label: "Shell capture timeout (ms)",
      description:
        "How long to wait for the shell to dump its environment. If your shell startup is slow (large rc files), bump this up; otherwise keep it low so gateway start doesn't hang.",
      example: "3000",
    },

    // diagnostics
    "diagnostics.enabled": {
      label: "Diagnostics master switch",
      description:
        "Turns on the diagnostics subsystem as a whole. Individual features below may also need their own toggles.",
      example: "true",
    },
    "diagnostics.stuckSessionWarnMs": {
      label: "Stuck session warning (ms)",
      description:
        "Emit a warning log if an agent session has been idle (no tokens, no tool activity) for at least this many milliseconds. Helps spot hung LLM calls.",
      example: "60000",
    },
    "diagnostics.otel.enabled": {
      label: "OTEL export",
      description:
        "Emit OpenTelemetry traces/metrics to the configured endpoint. Turn on for production tracing or when debugging distributed behavior.",
      example: "true",
      subsystem: "gateway",
    },
    "diagnostics.otel.endpoint": {
      label: "OTEL endpoint",
      description:
        "Target collector URL. Must be reachable from the gateway host.",
      example: "http://localhost:4318",
    },
    "diagnostics.otel.protocol": {
      label: "OTEL protocol",
      description:
        "Wire protocol for the exporter. `http/protobuf` is the most broadly supported.",
      example: "http/protobuf",
    },
    "diagnostics.otel.sampleRate": {
      label: "Sample rate",
      description:
        "Fraction of traces to keep (0.0 - 1.0). 1.0 keeps everything; drop to 0.1 in high-volume environments.",
      example: "1.0",
    },
    "diagnostics.cacheTrace.enabled": {
      label: "Cache trace",
      description:
        "Dump LLM cache hits and misses to a file for performance investigation. Leave off in production — produces large files quickly.",
      example: "false",
    },
    "diagnostics.cacheTrace.filePath": {
      label: "Cache trace file",
      description: "Where to write cache trace lines (JSONL).",
      example: "./logs/cache-trace.jsonl",
    },

    // logging
    "logging.level": {
      label: "File log level",
      description:
        "Severity threshold for what is written to the gateway log file. One of silent, fatal, error, warn, info, debug, trace.",
      example: "info",
      subsystem: "gateway",
    },
    "logging.file": {
      label: "Log file path",
      description:
        "Path to the gateway log file. Rotated when it exceeds `maxFileBytes`.",
      example: "./logs/openclaw.log",
    },
    "logging.maxFileBytes": {
      label: "Max file size (bytes)",
      description:
        "Rotation threshold. When the log file exceeds this size, it's rolled over.",
      example: "10485760",
    },
    "logging.consoleLevel": {
      label: "Console log level",
      description:
        "Separate severity threshold for stdout. Useful for running verbose in the terminal while keeping the file clean.",
      example: "warn",
    },
    "logging.consoleStyle": {
      label: "Console style",
      description:
        "Formatting for stdout — `pretty` for human-readable, `json` for machine pipelines.",
      example: "pretty",
    },
    "logging.redactSensitive": {
      label: "Redact sensitive",
      description:
        "Scrub sensitive content from logs. `tools` strips tool arguments and results — recommended for shared machines. `all` adds additional redactions; `off` disables.",
      example: "tools",
    },
    "logging.redactPatterns": {
      label: "Redaction regexes",
      description:
        "Extra regex patterns applied to log lines. Matching substrings are replaced with `[REDACTED]`.",
      example: '["(?i)api[_-]?key=\\\\S+"]',
    },

    // update
    "update.channel": {
      label: "Release channel",
      description:
        "Which release track to follow. `stable` for production, `beta` for pre-release, `dev` for nightly builds.",
      example: "stable",
    },
    "update.checkOnStart": {
      label: "Check on start",
      description:
        "Check for updates during gateway startup. Adds a small delay; disable for offline installs.",
      example: "true",
    },
    "update.auto.enabled": {
      label: "Auto-update",
      description:
        "Let OpenClaw self-update in the background. When off, updates are surfaced but not applied.",
      example: "false",
    },
    "update.auto.stableDelayHours": {
      label: "Stable update delay (hours)",
      description:
        "Wait this many hours after a stable release is published before pulling it. Combined with `stableJitterHours` to spread update load across fleets.",
      example: "24",
    },

    // browser
    "browser.enabled": {
      label: "Browser enabled",
      description:
        "Turn the browser subsystem on. Required for any web-capable agent tools.",
      example: "true",
    },
    "browser.headless": {
      label: "Headless",
      description:
        "Run Chromium without a visible window. Disable for debugging or when a captcha needs manual input.",
      example: "true",
    },
    "browser.noSandbox": {
      label: "No sandbox",
      description:
        "Launch Chromium with `--no-sandbox`. Only needed in restricted environments (e.g. some container setups). Reduces isolation.",
      example: "false",
    },
    "browser.attachOnly": {
      label: "Attach only",
      description:
        "Don't launch a browser; attach to an already-running Chromium via CDP. Useful when a remote browser is managed separately.",
      example: "false",
    },
    "browser.executablePath": {
      label: "Executable path",
      description:
        "Absolute path to the Chrome/Chromium binary. Leave empty to auto-detect.",
      example: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    "browser.ssrfPolicy.allowPrivateNetwork": {
      label: "Allow private network",
      description:
        "Allow agents to fetch URLs on LAN/loopback ranges (10.*, 192.168.*, 127.*, etc). Needed for local dev; a security footgun in production.",
      example: "true",
    },
    "browser.ssrfPolicy.dangerouslyAllowPrivateNetwork": {
      label: "Dangerously allow private network",
      description:
        "Bypass all SSRF checks. Only set true if you understand the risks — agents will be able to reach metadata services and internal infrastructure.",
      example: "false",
    },
    "browser.ssrfPolicy.allowedHostnames": {
      label: "Allowed hostnames",
      description:
        "Explicit allowlist of hostnames agents may fetch. Useful as a narrow alternative to `allowPrivateNetwork`.",
      example: '["localhost", "dev.internal"]',
    },

    // secrets
    "secrets.providers": {
      label: "Providers",
      description:
        "Map of secret provider name to configuration. The most common entry is `env` with `source: \"env\"` and an allowlist of uppercase env var names.",
      example:
        '{ "env": { "source": "env", "allow": ["OPENAI_API_KEY"] } }',
    },

    // agents
    "agents.defaults.model": {
      label: "Default model",
      description:
        "The model alias used when an agent doesn't specify its own. Must be defined in `models.providers`.",
      example: "anthropic/claude-opus-4.7",
    },
    "agents.defaults.workspace": {
      label: "Default workspace",
      description:
        "Filesystem root each agent is scoped to by default. Can be overridden per-agent.",
      example: "./workspace",
    },
    "agents.defaults.compaction": {
      label: "Compaction policy",
      description:
        "How aggressively to compact old messages when the context window fills. Tune between recall quality and cost.",
    },

    // models
    "models.providers": {
      label: "Providers",
      description:
        "Map of provider name to endpoint config (API URL, key reference, declared models). Only models declared here are usable by agents.",
      subsystem: "agent runtime",
    },
  },
};

export function getSectionCopy(section: string): ConfigSectionCopy | undefined {
  return CONFIG_COPY.sections[section];
}

export function getFieldCopy(path: string): ConfigFieldCopy | undefined {
  return CONFIG_COPY.fields[path];
}
