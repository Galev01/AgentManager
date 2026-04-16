import { Router, type Router as ExpressRouter } from "express";
import { BrainPersonNotFoundError, normalizePhone } from "@openclaw-manager/brain";
import { getBrainClient, isBrainEnabled } from "../services/brain.js";
import type { BrainPersonUpdate } from "@openclaw-manager/types";

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
    const people = await getBrainClient().listPeople();
    res.json(people);
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

export default router;
