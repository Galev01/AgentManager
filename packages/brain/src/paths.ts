import path from "node:path";

export type BrainPaths = {
  vaultRoot: string;
  peopleDir: string;
};

export function resolveBrainPaths(vaultRoot: string): BrainPaths {
  return {
    vaultRoot,
    peopleDir: path.join(vaultRoot, "People"),
  };
}

export function personFilePath(peopleDir: string, phone: string): string {
  return path.join(peopleDir, `${phone}.md`);
}
