import { Router, type Router as ExpressRouter } from "express";
import { BrainPersonNotFoundError, normalizePhone, renderInjectionPreview } from "@openclaw-manager/brain";
import { getBrainClient, getGlobalBrainClient, isBrainEnabled } from "../services/brain.js";
import { getConversations } from "../services/openclaw-state.js";
import type { BrainPersonUpdate, GlobalBrainUpdate, ConversationRow } from "@openclaw-manager/types";

const router: ExpressRouter = Router();

function ensureEnabled(res: import("express").Response): boolean {
  if (isBrainEnabled()) return true;
  res.status(503).json({ error: "Brain vault not configured. Set BRAIN_VAULT_PATH." });
  return false;
}

router.get("/brain/status", (_req, res) => {
  res.json({ enabled: isBrainEnabled() });
});

router.get("/brain/people", async (_req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const [people, convos] = await Promise.all([
      getBrainClient().listPeople(),
      getConversations().catch(() => [] as ConversationRow[]),
    ]);
    const byPhone = new Map(convos.map((c) => [c.phone, c]));
    const enriched = people.map((p) => {
      const c = byPhone.get(p.phone);
      if (!c) return { ...p, unreadCount: 0, lastMessageSnippet: null, lastMessageAt: null };
      return {
        ...p,
        unreadCount: computeUnread(c),
        lastMessageSnippet: truncate(c.lastRemoteContent, 30),
        lastMessageAt: c.lastRemoteAt,
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(503).json({ error: `Failed to list people: ${String(err)}` });
  }
});

router.post("/brain/people", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
  if (!normalizePhone(phone)) {
    res.status(400).json({ error: "phone is required (E.164 or JID form)" });
    return;
  }
  try {
    const person = await getBrainClient().createPerson({
      phone,
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      jid: typeof req.body?.jid === "string" ? req.body.jid : undefined,
    });
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/brain/people/:phone", async (req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const person = await getBrainClient().getPerson(req.params.phone);
    if (!person) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/brain/people/:phone", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const update: BrainPersonUpdate = {};
  const body = req.body ?? {};
  if (typeof body.name === "string") update.name = body.name;
  if (Array.isArray(body.aliases)) update.aliases = body.aliases.map(String);
  if (Array.isArray(body.tags)) update.tags = body.tags.map(String);
  if (body.relationship === null || typeof body.relationship === "string") update.relationship = body.relationship;
  if (body.language === null || typeof body.language === "string") update.language = body.language;
  if (body.status === "active" || body.status === "archived" || body.status === "blocked") update.status = body.status;
  if (typeof body.summary === "string") update.summary = body.summary;
  if (Array.isArray(body.facts)) update.facts = body.facts.map(String);
  if (Array.isArray(body.preferences)) update.preferences = body.preferences.map(String);
  if (Array.isArray(body.openThreads)) update.openThreads = body.openThreads.map(String);
  if (typeof body.notes === "string") update.notes = body.notes;
  if (typeof body.cursing === "boolean") update.cursing = body.cursing;
  if (typeof body.cursingRate === "number" && Number.isFinite(body.cursingRate)) {
    update.cursingRate = body.cursingRate;
  }
  if (Array.isArray(body.curses)) update.curses = body.curses.map(String);

  try {
    const person = await getBrainClient().updatePerson(req.params.phone, update);
    res.json(person);
  } catch (err) {
    if (err instanceof BrainPersonNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/brain/people/:phone/log", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const entry = typeof req.body?.entry === "string" ? req.body.entry.trim() : "";
  if (!entry) {
    res.status(400).json({ error: "entry is required" });
    return;
  }
  try {
    const person = await getBrainClient().appendLog(req.params.phone, entry);
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/brain/agent", async (_req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const brain = await getGlobalBrainClient().get();
    res.json(brain);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/brain/agent", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const body = req.body ?? {};
  const update: GlobalBrainUpdate = {};
  if (typeof body.persona === "string") update.persona = body.persona;
  if (typeof body.toneStyle === "string") update.toneStyle = body.toneStyle;
  if (Array.isArray(body.hardRules)) update.hardRules = body.hardRules.map(String);
  if (Array.isArray(body.globalFacts)) update.globalFacts = body.globalFacts.map(String);
  if (Array.isArray(body.doNotSay)) update.doNotSay = body.doNotSay.map(String);
  if (Array.isArray(body.defaultGoals)) update.defaultGoals = body.defaultGoals.map(String);
  try {
    const brain = await getGlobalBrainClient().update(update);
    res.json(brain);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/brain/agent/preview", async (_req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const brain = await getGlobalBrainClient().get();
    const preview = renderInjectionPreview({ brain });
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/brain/people/:phone/preview", async (req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const brainClient = getBrainClient();
    const person = await brainClient.getPerson(req.params.phone);
    if (!person) { res.status(404).json({ error: "Not found" }); return; }
    const brain = await getGlobalBrainClient().get();
    res.json(renderInjectionPreview({ brain, person }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/brain/people/:phone/log/:index/promote", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const target = req.body?.target;
  if (target !== "facts" && target !== "preferences" && target !== "openThreads") {
    res.status(400).json({ error: "target must be facts | preferences | openThreads" });
    return;
  }
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 0) {
    res.status(400).json({ error: "index must be a non-negative integer" });
    return;
  }
  try {
    const brainClient = getBrainClient();
    const person = await brainClient.getPerson(req.params.phone);
    if (!person) { res.status(404).json({ error: "Not found" }); return; }
    const line = person.log[idx];
    if (typeof line !== "string") {
      res.status(409).json({ error: "log entry moved or changed; refresh and retry" });
      return;
    }
    const listKey = target as "facts" | "preferences" | "openThreads";
    const list = person[listKey];
    if (list.includes(line)) {
      res.status(200).json({ unchanged: true, person });
      return;
    }
    const update: { facts?: string[]; preferences?: string[]; openThreads?: string[] } = {};
    update[listKey] = [...list, line];
    const updated = await brainClient.updatePerson(req.params.phone, update);
    res.status(201).json({ unchanged: false, person: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export function computeUnread(c: ConversationRow): number {
  const lastOut = Math.max(c.lastAgentReplyAt ?? 0, c.lastHumanReplyAt ?? 0);
  const lastIn = c.lastRemoteAt ?? 0;
  return lastIn > lastOut ? 1 : 0;
}

export function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export default router;
