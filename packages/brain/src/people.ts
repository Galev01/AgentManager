import fs from "node:fs/promises";
import path from "node:path";
import type {
  BrainPerson,
  BrainPersonCreate,
  BrainPersonSummary,
  BrainPersonUpdate,
} from "@openclaw-manager/types";
import { resolveBrainPaths, personFilePath, type BrainPaths } from "./paths.js";
import { normalizePhone, jidForPhone } from "./phone.js";
import { parsePerson, serializePerson, applyUpdate } from "./schema.js";

export class BrainNotConfiguredError extends Error {
  constructor() {
    super("BRAIN_VAULT_PATH not configured");
    this.name = "BrainNotConfiguredError";
  }
}

export class BrainPersonNotFoundError extends Error {
  constructor(phone: string) {
    super(`Person not found: ${phone}`);
    this.name = "BrainPersonNotFoundError";
  }
}

export type BrainClient = {
  paths: BrainPaths;
  ensureLayout(): Promise<void>;
  listPeople(): Promise<BrainPersonSummary[]>;
  getPerson(phone: string): Promise<BrainPerson | null>;
  resolveByJid(jid: string): Promise<BrainPerson | null>;
  createPerson(input: BrainPersonCreate): Promise<BrainPerson>;
  ensureStub(phone: string, opts?: { name?: string; jid?: string | null }): Promise<BrainPerson>;
  updatePerson(phone: string, update: BrainPersonUpdate): Promise<BrainPerson>;
  appendLog(phone: string, entry: string): Promise<BrainPerson>;
  touchLastSeen(phone: string): Promise<void>;
  personFilePath(phone: string): string;
};

export function createBrainClient(vaultRoot: string): BrainClient {
  if (!vaultRoot || !vaultRoot.trim()) throw new BrainNotConfiguredError();
  const paths = resolveBrainPaths(vaultRoot);

  async function atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, filePath);
  }

  async function readPersonFile(phone: string): Promise<BrainPerson | null> {
    const filePath = personFilePath(paths.peopleDir, phone);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return parsePerson(phone, raw);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return null;
      throw err;
    }
  }

  async function writePerson(person: BrainPerson): Promise<BrainPerson> {
    const filePath = personFilePath(paths.peopleDir, person.phone);
    const raw = serializePerson(person);
    await atomicWrite(filePath, raw);
    return { ...person, raw };
  }

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function nowIsoMinutes(): string {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }

  async function ensureLayout(): Promise<void> {
    await fs.mkdir(paths.peopleDir, { recursive: true });
  }

  async function listPeople(): Promise<BrainPersonSummary[]> {
    await ensureLayout();
    let entries: string[];
    try {
      entries = await fs.readdir(paths.peopleDir);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return [];
      throw err;
    }
    const out: BrainPersonSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const phone = entry.slice(0, -3);
      const person = await readPersonFile(phone);
      if (!person) continue;
      out.push({
        phone: person.phone,
        name: person.name,
        relationship: person.relationship,
        language: person.language,
        status: person.status,
        lastSeen: person.lastSeen,
        tags: person.tags,
      });
    }
    out.sort((a, b) => {
      const ta = a.lastSeen || "";
      const tb = b.lastSeen || "";
      if (ta !== tb) return ta < tb ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  async function getPerson(phone: string): Promise<BrainPerson | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    return readPersonFile(normalized);
  }

  async function resolveByJid(jid: string): Promise<BrainPerson | null> {
    const phone = normalizePhone(jid);
    if (!phone) return null;
    return readPersonFile(phone);
  }

  async function createPerson(input: BrainPersonCreate): Promise<BrainPerson> {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new Error(`Invalid phone: ${input.phone}`);
    await ensureLayout();
    const existing = await readPersonFile(phone);
    if (existing) return existing;

    const today = todayIso();
    const jid = input.jid === undefined ? jidForPhone(phone) : input.jid;
    const name = (input.name || "").trim() || phone;
    const person: BrainPerson = {
      phone,
      jid,
      name,
      aliases: name !== phone ? [name] : [],
      tags: ["person"],
      relationship: null,
      language: null,
      status: "active",
      created: today,
      lastSeen: today,
      summary: "",
      facts: [],
      preferences: [],
      openThreads: [],
      notes: "",
      log: [`${nowIsoMinutes()} — stub created`],
      raw: "",
      parseWarning: null,
    };
    return writePerson(person);
  }

  async function ensureStub(
    phone: string,
    opts?: { name?: string; jid?: string | null },
  ): Promise<BrainPerson> {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error(`Invalid phone: ${phone}`);
    const existing = await readPersonFile(normalized);
    if (existing) {
      // Back-fill name if we have one and the stored one is the phone.
      if (opts?.name && existing.name === existing.phone) {
        const today = todayIso();
        const updated: BrainPerson = {
          ...existing,
          name: opts.name.trim(),
          aliases: existing.aliases.length ? existing.aliases : [opts.name.trim()],
          lastSeen: today,
        };
        return writePerson(updated);
      }
      return existing;
    }
    return createPerson({ phone: normalized, name: opts?.name, jid: opts?.jid });
  }

  async function updatePerson(phone: string, update: BrainPersonUpdate): Promise<BrainPerson> {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error(`Invalid phone: ${phone}`);
    const existing = await readPersonFile(normalized);
    if (!existing) throw new BrainPersonNotFoundError(normalized);
    const next = applyUpdate(existing, update);
    return writePerson(next);
  }

  async function appendLog(phone: string, entry: string): Promise<BrainPerson> {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error(`Invalid phone: ${phone}`);
    const existing = await readPersonFile(normalized);
    const person = existing ?? (await createPerson({ phone: normalized }));
    const line = `${nowIsoMinutes()} — ${entry.trim()}`;
    const next: BrainPerson = {
      ...person,
      log: [...person.log, line],
      lastSeen: todayIso(),
    };
    return writePerson(next);
  }

  async function touchLastSeen(phone: string): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const existing = await readPersonFile(normalized);
    if (!existing) return;
    const today = todayIso();
    if (existing.lastSeen === today) return;
    await writePerson({ ...existing, lastSeen: today });
  }

  return {
    paths,
    ensureLayout,
    listPeople,
    getPerson,
    resolveByJid,
    createPerson,
    ensureStub,
    updatePerson,
    appendLog,
    touchLastSeen,
    personFilePath: (phone: string) => personFilePath(paths.peopleDir, phone),
  };
}
