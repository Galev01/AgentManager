export type CommandDef = {
  method: string;
  description: string;
  category: string;
  params: { name: string; type: string; required: boolean; description: string }[];
};

export const COMMAND_CATEGORIES = [
  "Agents",
  "Sessions",
  "Chat",
  "Config",
  "Channels",
  "Cron",
  "System",
  "Skills",
] as const;

export const COMMANDS: CommandDef[] = [
  // Agents
  { method: "agents.list", description: "List all configured agents", category: "Agents", params: [] },
  { method: "agents.create", description: "Create a new agent with specified configuration", category: "Agents", params: [
    { name: "name", type: "string", required: true, description: "Agent name" },
    { name: "model", type: "string", required: false, description: "Model to use" },
  ]},
  { method: "agents.update", description: "Update an existing agent's configuration", category: "Agents", params: [
    { name: "id", type: "string", required: true, description: "Agent ID" },
  ]},
  { method: "agents.delete", description: "Delete an agent", category: "Agents", params: [
    { name: "id", type: "string", required: true, description: "Agent ID" },
  ]},
  { method: "agents.identity", description: "Get agent identity information", category: "Agents", params: [] },

  // Sessions
  { method: "sessions.list", description: "List all active sessions", category: "Sessions", params: [] },
  { method: "sessions.create", description: "Create a new session", category: "Sessions", params: [
    { name: "agentId", type: "string", required: false, description: "Agent ID to bind session to" },
  ]},
  { method: "sessions.send", description: "Send a message to a session", category: "Sessions", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
    { name: "message", type: "string", required: true, description: "Message content" },
  ]},
  { method: "sessions.delete", description: "Delete a session", category: "Sessions", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
  ]},
  { method: "sessions.reset", description: "Reset a session's state", category: "Sessions", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
  ]},
  { method: "sessions.abort", description: "Abort a running session execution", category: "Sessions", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
  ]},
  { method: "sessions.usage", description: "Get token usage statistics for a session", category: "Sessions", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
  ]},
  { method: "sessions.compact", description: "Compact session message history", category: "Sessions", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
  ]},

  // Chat
  { method: "chat.send", description: "Send a chat message through a channel", category: "Chat", params: [
    { name: "channel", type: "string", required: true, description: "Channel name (e.g. whatsapp)" },
    { name: "to", type: "string", required: true, description: "Recipient ID" },
    { name: "message", type: "string", required: true, description: "Message text" },
  ]},
  { method: "chat.inject", description: "Inject a message into session history", category: "Chat", params: [
    { name: "sessionId", type: "string", required: true, description: "Session ID" },
    { name: "role", type: "string", required: true, description: "Message role (user/assistant)" },
    { name: "content", type: "string", required: true, description: "Message content" },
  ]},

  // Config
  { method: "config.get", description: "Get current OpenClaw configuration", category: "Config", params: [] },
  { method: "config.set", description: "Set a configuration value", category: "Config", params: [
    { name: "key", type: "string", required: true, description: "Config key path" },
    { name: "value", type: "any", required: true, description: "Config value" },
  ]},
  { method: "config.apply", description: "Apply a config patch object", category: "Config", params: [
    { name: "patch", type: "object", required: true, description: "Config patch object" },
  ]},
  { method: "config.schema", description: "Get full config JSON schema", category: "Config", params: [] },

  // Channels
  { method: "channels.status", description: "Get status of all channels", category: "Channels", params: [] },
  { method: "channels.logout", description: "Logout from a channel", category: "Channels", params: [
    { name: "channel", type: "string", required: true, description: "Channel name" },
  ]},

  // Cron
  { method: "cron.list", description: "List all scheduled cron jobs", category: "Cron", params: [] },
  { method: "cron.add", description: "Add a new cron job", category: "Cron", params: [
    { name: "schedule", type: "string", required: true, description: "Cron expression" },
    { name: "command", type: "string", required: true, description: "Command to execute" },
  ]},
  { method: "cron.remove", description: "Remove a cron job", category: "Cron", params: [
    { name: "id", type: "string", required: true, description: "Cron job ID" },
  ]},
  { method: "cron.status", description: "Get cron job status", category: "Cron", params: [
    { name: "id", type: "string", required: true, description: "Cron job ID" },
  ]},
  { method: "cron.run", description: "Run a cron job immediately", category: "Cron", params: [
    { name: "id", type: "string", required: true, description: "Cron job ID" },
  ]},

  // System
  { method: "logs.tail", description: "Tail the OpenClaw system logs", category: "System", params: [
    { name: "lines", type: "number", required: false, description: "Number of lines to return (default 100)" },
  ]},
  { method: "models.list", description: "List available AI models", category: "System", params: [] },
  { method: "tools.catalog", description: "Get catalog of available tools", category: "System", params: [] },
  { method: "tools.effective", description: "Get currently effective tools for the active agent", category: "System", params: [] },

  // Skills
  { method: "skills.status", description: "Get status of installed skills", category: "Skills", params: [] },
  { method: "skills.install", description: "Install a new skill", category: "Skills", params: [
    { name: "url", type: "string", required: true, description: "Skill package URL" },
  ]},
];
