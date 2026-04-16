import fs from "node:fs/promises";
import path from "node:path";

const ENTRY = ".openclaw-review/";

async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(projectPath, ".git"));
    return stat.isDirectory() || stat.isFile(); // worktrees have a .git file
  } catch {
    return false;
  }
}

export async function ensureGitignore(projectPath: string): Promise<void> {
  if (!(await isGitRepo(projectPath))) return;
  const file = path.join(projectPath, ".gitignore");
  let contents = "";
  try {
    contents = await fs.readFile(file, "utf8");
  } catch {
    contents = "";
  }
  const lines = contents.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(ENTRY)) return;
  const needsNewline = contents.length > 0 && !contents.endsWith("\n");
  const append = (needsNewline ? "\n" : "") + ENTRY + "\n";
  await fs.writeFile(file, contents + append, "utf8");
}
