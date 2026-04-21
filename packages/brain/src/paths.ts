import path from "node:path";

export type BrainPaths = {
  vaultRoot: string;
  peopleDir: string;
  brainDir: string;
  globalBrainFile: string;
};

export function resolveBrainPaths(vaultRoot: string): BrainPaths {
  const brainDir = path.join(vaultRoot, "Brain");
  return {
    vaultRoot,
    peopleDir: path.join(vaultRoot, "People"),
    brainDir,
    globalBrainFile: path.join(brainDir, "WhatsApp.md"),
  };
}

export function personFilePath(peopleDir: string, phone: string): string {
  return path.join(peopleDir, `${phone}.md`);
}
