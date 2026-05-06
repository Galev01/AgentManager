export interface ShimChatRequest {
  session_id: string;
  message: string;
}

export interface ShimChatReply {
  assistantText: string;
  elapsedMs: number;
}

export class ShimError extends Error {
  constructor(public status: number, public detail: string, message?: string) {
    super(message ?? `shim ${status}: ${detail}`);
    this.name = "ShimError";
  }
}

export interface ShimClientOptions {
  baseUrl: string;
  shimToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ShimClient {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  constructor(private opts: ShimClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 200_000;
  }

  async chat(req: ShimChatRequest): Promise<ShimChatReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.shimToken}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const bodyText = await res.text();
    if (!res.ok) {
      let detail = bodyText;
      try { detail = JSON.parse(bodyText).detail ?? bodyText; } catch {}
      throw new ShimError(res.status, detail);
    }
    let parsed: any;
    try { parsed = JSON.parse(bodyText); } catch {
      throw new ShimError(res.status, `non-JSON body: ${bodyText.slice(0, 200)}`);
    }
    return { assistantText: String(parsed.assistant_text ?? ""), elapsedMs: Number(parsed.elapsed_ms ?? 0) };
  }
}
