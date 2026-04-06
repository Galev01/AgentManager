import fs from "node:fs/promises";
import { config } from "../config.js";
import type { ManagementCommand } from "@openclaw-manager/types";
import crypto from "node:crypto";

export async function enqueueCommand(
  command: Omit<ManagementCommand, "id" | "at">
): Promise<ManagementCommand> {
  const full: ManagementCommand = {
    ...command,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  const line = JSON.stringify(full) + "\n";
  await fs.appendFile(config.commandsPath, line, "utf8");
  return full;
}
