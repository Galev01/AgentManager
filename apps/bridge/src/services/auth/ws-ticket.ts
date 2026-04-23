import crypto from "node:crypto";

export type WsTicketClaim = { userId: string; sessionId: string };
type StoredTicket = WsTicketClaim & { expiresAt: number };

export function createWsTicketStore(cfg: { ttlMs: number }) {
  const tickets = new Map<string, StoredTicket>();
  function sweep(): void {
    const now = Date.now();
    for (const [k, v] of tickets) if (v.expiresAt <= now) tickets.delete(k);
  }
  return {
    issue(claim: WsTicketClaim): { ticket: string; expiresAt: string } {
      sweep();
      const ticket = crypto.randomBytes(24).toString("base64url");
      const expiresAt = Date.now() + cfg.ttlMs;
      tickets.set(ticket, { ...claim, expiresAt });
      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },
    consume(ticket: string): WsTicketClaim | null {
      sweep();
      const row = tickets.get(ticket);
      if (!row) return null;
      tickets.delete(ticket);
      if (row.expiresAt <= Date.now()) return null;
      return { userId: row.userId, sessionId: row.sessionId };
    },
  };
}
