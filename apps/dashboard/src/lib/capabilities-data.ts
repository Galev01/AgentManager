export type CapabilityCategory = "channels" | "models" | "plugins" | "skills";

export type CapabilityStatus = "available" | "installed" | "configured" | "coming_soon";

export type SetupField = {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "toggle";
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  envHint?: string;
};

export type Capability = {
  id: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  icon: string;
  color: string;
  docsUrl?: string;
  setupFields: SetupField[];
  gatewayMethod?: string;
  tags: string[];
};

export const CATEGORY_META: Record<CapabilityCategory, { label: string; description: string; icon: string }> = {
  channels: {
    label: "Channels",
    description: "Connect messaging platforms to your OpenClaw agent",
    icon: "💬",
  },
  models: {
    label: "AI Models",
    description: "Add language model providers for your agent to use",
    icon: "🧠",
  },
  plugins: {
    label: "Plugins",
    description: "Extend your agent with custom behaviors and integrations",
    icon: "🔌",
  },
  skills: {
    label: "Skills",
    description: "Install pre-built skills from ClawHub marketplace",
    icon: "⚡",
  },
};

export const CAPABILITIES: Capability[] = [
  // === Channels ===
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect your agent to WhatsApp via WhatsApp Web. Supports DMs, groups, read receipts, and media.",
    category: "channels",
    icon: "💚",
    color: "#25D366",
    setupFields: [
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
      {
        key: "dmPolicy",
        label: "DM Policy",
        type: "select",
        required: true,
        options: [
          { value: "open", label: "Open — respond to everyone" },
          { value: "allowlist", label: "Allowlist — only approved contacts" },
          { value: "disabled", label: "Disabled" },
        ],
      },
      {
        key: "groupPolicy",
        label: "Group Policy",
        type: "select",
        required: true,
        options: [
          { value: "open", label: "Open — respond in all groups" },
          { value: "mention", label: "Mention — only when mentioned" },
          { value: "disabled", label: "Disabled" },
        ],
      },
      { key: "sendReadReceipts", label: "Send Read Receipts", type: "toggle", required: false },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "mobile", "popular"],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Connect your agent to Discord servers. Supports text channels, DMs, threads, and slash commands.",
    category: "channels",
    icon: "🟣",
    color: "#5865F2",
    setupFields: [
      { key: "token", label: "Bot Token", type: "password", required: true, placeholder: "Enter Discord bot token", envHint: "DISCORD_TOKEN" },
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "community", "popular"],
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect your agent to Telegram. Supports bots, groups, inline queries, and rich media.",
    category: "channels",
    icon: "✈️",
    color: "#0088CC",
    setupFields: [
      { key: "token", label: "Bot Token", type: "password", required: true, placeholder: "Enter Telegram bot token from @BotFather", envHint: "TELEGRAM_TOKEN" },
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "bots", "popular"],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Connect your agent to Slack workspaces. Supports channels, DMs, threads, and app mentions.",
    category: "channels",
    icon: "💜",
    color: "#4A154B",
    setupFields: [
      { key: "token", label: "Bot Token", type: "password", required: true, placeholder: "xoxb-...", envHint: "SLACK_BOT_TOKEN" },
      { key: "appToken", label: "App Token", type: "password", required: true, placeholder: "xapp-...", envHint: "SLACK_APP_TOKEN" },
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "workspace"],
  },
  {
    id: "matrix",
    name: "Matrix",
    description: "Connect to the Matrix decentralized network. Supports rooms, DMs, and end-to-end encryption.",
    category: "channels",
    icon: "🟩",
    color: "#0DBD8B",
    setupFields: [
      { key: "homeserver", label: "Homeserver URL", type: "text", required: true, placeholder: "https://matrix.org" },
      { key: "token", label: "Access Token", type: "password", required: true, placeholder: "Enter Matrix access token" },
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "decentralized", "encrypted"],
  },
  {
    id: "irc",
    name: "IRC",
    description: "Classic Internet Relay Chat. Connect to any IRC network and join channels.",
    category: "channels",
    icon: "📡",
    color: "#6c757d",
    setupFields: [
      { key: "server", label: "Server", type: "text", required: true, placeholder: "irc.libera.chat" },
      { key: "nick", label: "Nickname", type: "text", required: true, placeholder: "openclaw-bot" },
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "classic"],
  },
  {
    id: "signal",
    name: "Signal",
    description: "Connect to Signal messenger for private, encrypted conversations.",
    category: "channels",
    icon: "🔵",
    color: "#3A76F0",
    setupFields: [
      { key: "phone", label: "Phone Number", type: "text", required: true, placeholder: "+1234567890" },
      { key: "enabled", label: "Enable Channel", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["messaging", "encrypted", "privacy"],
  },

  // === Models ===
  {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run AI models locally with Ollama. No API key needed — completely private and free.",
    category: "models",
    icon: "🦙",
    color: "#ffffff",
    setupFields: [
      { key: "baseUrl", label: "Ollama URL", type: "text", required: false, placeholder: "http://127.0.0.1:11434 (default)" },
      { key: "model", label: "Model", type: "text", required: true, placeholder: "e.g. gemma4, llama3, mistral" },
    ],
    gatewayMethod: "config.apply",
    tags: ["local", "free", "private"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, and more. Industry-leading language models from OpenAI.",
    category: "models",
    icon: "🤖",
    color: "#10A37F",
    setupFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-...", envHint: "OPENAI_API_KEY" },
      {
        key: "model",
        label: "Default Model",
        type: "select",
        required: true,
        options: [
          { value: "gpt-4o", label: "GPT-4o" },
          { value: "gpt-4o-mini", label: "GPT-4o Mini" },
          { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
        ],
      },
    ],
    gatewayMethod: "config.apply",
    tags: ["cloud", "premium", "popular"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models — safe, helpful, and capable. Claude Opus, Sonnet, and Haiku.",
    category: "models",
    icon: "🧡",
    color: "#D97757",
    setupFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-ant-...", envHint: "ANTHROPIC_API_KEY" },
      {
        key: "model",
        label: "Default Model",
        type: "select",
        required: true,
        options: [
          { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
          { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
        ],
      },
    ],
    gatewayMethod: "config.apply",
    tags: ["cloud", "premium", "safe"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access 200+ models through a single API. Automatic fallback and cost optimization.",
    category: "models",
    icon: "🌐",
    color: "#6366F1",
    setupFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-or-...", envHint: "OPENROUTER_API_KEY" },
    ],
    gatewayMethod: "config.apply",
    tags: ["cloud", "multi-model", "flexible"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "High-quality reasoning models at competitive prices. Strong at code and math.",
    category: "models",
    icon: "🔭",
    color: "#4D6BFE",
    setupFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "Enter DeepSeek API key", envHint: "DEEPSEEK_API_KEY" },
    ],
    gatewayMethod: "config.apply",
    tags: ["cloud", "reasoning", "affordable"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "European AI models — fast, efficient, and multilingual. Mistral Large and Small.",
    category: "models",
    icon: "🌊",
    color: "#FF7000",
    setupFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "Enter Mistral API key", envHint: "MISTRAL_API_KEY" },
    ],
    gatewayMethod: "config.apply",
    tags: ["cloud", "european", "multilingual"],
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Google's Gemini models with strong multimodal and long-context capabilities.",
    category: "models",
    icon: "💎",
    color: "#4285F4",
    setupFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "Enter Gemini API key", envHint: "GEMINI_API_KEY" },
    ],
    gatewayMethod: "config.apply",
    tags: ["cloud", "multimodal", "long-context"],
  },

  // === Plugins ===
  {
    id: "duckduckgo",
    name: "DuckDuckGo Search",
    description: "Give your agent the ability to search the web using DuckDuckGo. Private and tracker-free.",
    category: "plugins",
    icon: "🦆",
    color: "#DE5833",
    setupFields: [
      { key: "enabled", label: "Enable Plugin", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["search", "web", "privacy"],
  },
  {
    id: "whatsapp-auto-reply",
    name: "WhatsApp Auto Reply",
    description: "Delays first replies, auto-forwards summaries, and manages human takeover for WhatsApp conversations.",
    category: "plugins",
    icon: "🦀",
    color: "#886CC0",
    setupFields: [
      { key: "delayMs", label: "Cold Start Delay (ms)", type: "text", required: false, placeholder: "600000" },
      { key: "summaryDelayMs", label: "Summary Delay (ms)", type: "text", required: false, placeholder: "900000" },
      { key: "relayTarget", label: "Relay Target Phone", type: "text", required: false, placeholder: "+972..." },
      { key: "enabled", label: "Enable Plugin", type: "toggle", required: true },
    ],
    gatewayMethod: "config.apply",
    tags: ["whatsapp", "automation", "messaging"],
  },

  // === Skills ===
  {
    id: "skill-web-browse",
    name: "Web Browsing",
    description: "Let your agent browse the web, read pages, and extract information from URLs.",
    category: "skills",
    icon: "🌍",
    color: "#3B82F6",
    setupFields: [],
    gatewayMethod: "skills.install",
    tags: ["web", "research"],
  },
  {
    id: "skill-code-exec",
    name: "Code Execution",
    description: "Execute code in a sandboxed environment. Supports Python, JavaScript, and shell scripts.",
    category: "skills",
    icon: "💻",
    color: "#10B981",
    setupFields: [],
    gatewayMethod: "skills.install",
    tags: ["code", "sandbox"],
  },
  {
    id: "skill-image-gen",
    name: "Image Generation",
    description: "Generate images using AI models like DALL-E, Stable Diffusion, or Flux via fal.ai.",
    category: "skills",
    icon: "🎨",
    color: "#F59E0B",
    setupFields: [
      { key: "apiKey", label: "fal.ai API Key", type: "password", required: true, envHint: "FAL_KEY" },
    ],
    gatewayMethod: "skills.install",
    tags: ["creative", "images", "ai"],
  },
  {
    id: "skill-speech",
    name: "Voice & Speech",
    description: "Text-to-speech and speech-to-text using ElevenLabs or Deepgram.",
    category: "skills",
    icon: "🎙️",
    color: "#8B5CF6",
    setupFields: [
      {
        key: "provider",
        label: "Provider",
        type: "select",
        required: true,
        options: [
          { value: "elevenlabs", label: "ElevenLabs" },
          { value: "deepgram", label: "Deepgram" },
        ],
      },
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
    gatewayMethod: "skills.install",
    tags: ["voice", "audio", "tts"],
  },
];
