import crypto from "node:crypto";
import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { isValidVideoId } from "../services/youtube-url.js";
import { enqueueChatJob } from "../services/youtube-chat-worker.js";
import { foldChatLog, readChatMeta } from "../services/youtube-store-v2.js";
import type { YoutubeChatMessageRow } from "@openclaw-manager/types";

const router: ExpressRouter = Router();

const MAX_MESSAGE_CHARS = 8000;

function badId(res: Response): void {
  res.status(400).json({ ok: false, error: "invalid videoId" });
}

function defaultChatSessionId(videoId: string): string {
  return `${videoId}-main`;
}

router.post("/youtube/chat/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);

  const rawMessage: unknown = req.body?.message;
  if (typeof rawMessage !== "string") {
    return void res.status(400).json({ ok: false, error: "message must be a string" });
  }
  const message = rawMessage.trim();
  if (!message) {
    return void res.status(400).json({ ok: false, error: "message must be non-empty" });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return void res
      .status(400)
      .json({ ok: false, error: `message exceeds ${MAX_MESSAGE_CHARS} characters` });
  }

  const rawSessionId: unknown = req.body?.chatSessionId;
  const chatSessionId =
    typeof rawSessionId === "string" && rawSessionId.trim()
      ? rawSessionId.trim()
      : defaultChatSessionId(videoId);

  try {
    const turnId = crypto.randomUUID();
    const userRowId = crypto.randomUUID();
    const assistantRowId = crypto.randomUUID();
    const userRow: YoutubeChatMessageRow = {
      id: userRowId,
      videoId,
      chatSessionId,
      turnId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      status: "complete",
    };
    enqueueChatJob({ videoId, chatSessionId, userRow, assistantRowId });
    res.status(202).json({ ok: true, videoId, chatSessionId, queued: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

router.get("/youtube/chat/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);

  const rawSessionId = req.query.sessionId;
  const chatSessionId =
    typeof rawSessionId === "string" && rawSessionId.trim()
      ? rawSessionId.trim()
      : defaultChatSessionId(videoId);
  const rawAfter = req.query.after;
  const after = typeof rawAfter === "string" && rawAfter.trim() ? rawAfter.trim() : null;

  try {
    const [meta, allMessages] = await Promise.all([
      readChatMeta(videoId),
      foldChatLog(videoId),
    ]);
    const sessionMessages = allMessages.filter((m) => m.chatSessionId === chatSessionId);
    const messages = after
      ? sessionMessages.filter((m) => m.createdAt > after)
      : sessionMessages;
    res.json({ ok: true, videoId, chatSessionId, meta, messages });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

export default router;
