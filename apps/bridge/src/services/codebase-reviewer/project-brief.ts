import fs from "node:fs/promises";
import path from "node:path";

const MAX_TOTAL_CHARS = 40_000;
const MAX_FILE_CHARS = 4_000;
const MAX_DEPTH = 4;
const MAX_ENTRIES_PER_DIR = 40;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "target",
  "__pycache__", ".venv", "venv", "env", ".turbo", ".cache", ".parcel-cache",
  "coverage", ".nuxt", "vendor", ".idea", ".vscode", ".gradle", ".dart_tool",
  ".pub-cache", "android", "ios", "DerivedData", ".openclaw-review",
]);

const PRIORITIZED_FILES = [
  "README.md", "README", "readme.md",
  "package.json", "pyproject.toml", "pubspec.yaml", "Cargo.toml", "go.mod",
  "tsconfig.json", "next.config.js", "next.config.mjs", "next.config.ts",
  "vite.config.js", "vite.config.ts", "docker-compose.yml", "Dockerfile",
  "AGENTS.md", "CLAUDE.md", "ARCHITECTURE.md", "PLAN.md",
];

const TEXT_EXTS = new Set([
  ".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go",
  ".rs", ".java", ".kt", ".swift", ".dart", ".c", ".h", ".cpp", ".hpp",
  ".cs", ".php", ".sh", ".bat", ".ps1", ".html", ".css", ".scss", ".sass",
  ".sql", ".graphql", ".proto", ".xml", ".svelte", ".vue",
]);

function isIgnoredDir(name: string): boolean {
  if (name.startsWith(".") && !["._env", ".env", ".env.example", ".env.local"].includes(name)) {
    // hidden dirs skipped except explicitly useful ones (none for dirs)
    return true;
  }
  return IGNORED_DIRS.has(name);
}

type TreeLine = string;

async function walkTree(
  root: string,
  current: string,
  depth: number,
  lines: TreeLine[],
  counts: { files: number; dirs: number; bytes: number }
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: { name: string; dir: boolean; size: number }[] = [];
  try {
    const dirents = await fs.readdir(current, { withFileTypes: true });
    for (const d of dirents) {
      if (d.isDirectory()) {
        if (isIgnoredDir(d.name)) continue;
        entries.push({ name: d.name, dir: true, size: 0 });
      } else if (d.isFile()) {
        const ext = path.extname(d.name).toLowerCase();
        if (!TEXT_EXTS.has(ext) && !PRIORITIZED_FILES.includes(d.name)) {
          counts.files += 1;
          continue;
        }
        let size = 0;
        try {
          const s = await fs.stat(path.join(current, d.name));
          size = s.size;
          counts.bytes += size;
        } catch { /* ignore */ }
        entries.push({ name: d.name, dir: false, size });
      }
    }
  } catch {
    return;
  }
  entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  entries = entries.slice(0, MAX_ENTRIES_PER_DIR);
  for (const e of entries) {
    const rel = path.relative(root, path.join(current, e.name)).replace(/\\/g, "/");
    if (e.dir) {
      counts.dirs += 1;
      lines.push(`${"  ".repeat(depth)}${rel}/`);
      await walkTree(root, path.join(current, e.name), depth + 1, lines, counts);
    } else {
      counts.files += 1;
      const kb = (e.size / 1024).toFixed(1);
      lines.push(`${"  ".repeat(depth)}${rel} (${kb}kb)`);
    }
  }
}

async function pickFilesToInclude(root: string): Promise<string[]> {
  const selected: string[] = [];
  // 1. Always-include priority files at the root
  for (const name of PRIORITIZED_FILES) {
    const p = path.join(root, name);
    try {
      await fs.access(p);
      selected.push(p);
    } catch { /* skip */ }
  }
  // 2. Add a small sample of source files by walking one level down
  const candidates: { file: string; depth: number; weight: number }[] = [];
  async function collect(dir: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let dirents: { name: string; dir: boolean }[] = [];
    try {
      const raw = await fs.readdir(dir, { withFileTypes: true });
      dirents = raw.map((d) => ({ name: d.name, dir: d.isDirectory() }));
    } catch {
      return;
    }
    for (const d of dirents) {
      if (d.dir) {
        if (isIgnoredDir(d.name)) continue;
        await collect(path.join(dir, d.name), depth + 1);
      } else {
        const ext = path.extname(d.name).toLowerCase();
        if (!TEXT_EXTS.has(ext)) continue;
        if (PRIORITIZED_FILES.includes(d.name)) continue;
        const full = path.join(dir, d.name);
        let weight = 1;
        if (/(index|main|app|server|routes?|page)\./i.test(d.name)) weight += 3;
        if (/\.tsx?$/.test(d.name) || /\.py$/.test(d.name) || /\.go$/.test(d.name)) weight += 1;
        candidates.push({ file: full, depth, weight: weight - depth });
      }
    }
  }
  await collect(root, 0);
  candidates.sort((a, b) => b.weight - a.weight);
  for (const c of candidates) {
    if (selected.length >= 15) break;
    if (!selected.includes(c.file)) selected.push(c.file);
  }
  return selected;
}

async function readGitLog(projectPath: string): Promise<string> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(
      'git log -n 20 --pretty=format:"%h %s (%ar)"',
      { cwd: projectPath, timeout: 5000 }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function buildProjectBrief(projectPath: string): Promise<string> {
  const treeLines: TreeLine[] = [];
  const counts = { files: 0, dirs: 0, bytes: 0 };
  await walkTree(projectPath, projectPath, 0, treeLines, counts);
  const fileList = await pickFilesToInclude(projectPath);

  const parts: string[] = [];
  parts.push(`# Project Brief: ${path.basename(projectPath)}`);
  parts.push(``);
  parts.push(`Absolute path: ${projectPath}`);
  parts.push(`Stats: ~${counts.files} files across ~${counts.dirs} directories (walked ${MAX_DEPTH} levels deep).`);
  parts.push(``);
  const gitLog = await readGitLog(projectPath);
  if (gitLog) {
    parts.push(`## Recent git log (last 20)`);
    parts.push("```");
    parts.push(gitLog.slice(0, 2000));
    parts.push("```");
    parts.push(``);
  }
  parts.push(`## File tree (partial)`);
  parts.push("```");
  parts.push(treeLines.slice(0, 200).join("\n"));
  if (treeLines.length > 200) parts.push(`... (${treeLines.length - 200} more entries omitted)`);
  parts.push("```");
  parts.push(``);
  parts.push(`## Selected file contents`);
  let total = parts.join("\n").length;
  for (const file of fileList) {
    if (total >= MAX_TOTAL_CHARS) break;
    let content = "";
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + `\n... (${content.length - MAX_FILE_CHARS} chars truncated)`;
    }
    const rel = path.relative(projectPath, file).replace(/\\/g, "/");
    const ext = path.extname(file).slice(1) || "";
    const block = `\n### ${rel}\n\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
    if (total + block.length > MAX_TOTAL_CHARS) {
      const remaining = MAX_TOTAL_CHARS - total;
      if (remaining > 500) {
        parts.push(block.slice(0, remaining) + "\n... (brief truncated at budget)");
        total = MAX_TOTAL_CHARS;
      }
      break;
    }
    parts.push(block);
    total += block.length;
  }
  return parts.join("\n");
}
