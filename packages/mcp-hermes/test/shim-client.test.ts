import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShimClient } from "../src/shim-client.js";

describe("ShimClient.chat", () => {
  let client: ShimClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new ShimClient({
      baseUrl: "http://127.0.0.1:9119",
      shimToken: "shim-secret",
      fetchImpl: fetchMock,
    });
  });

  it("POSTs to /v1/chat with correct payload + auth", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true, assistant_text: "hi", session_id: "s1", elapsed_ms: 42,
      }),
    });
    const reply = await client.chat({ session_id: "s1", message: "hello" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9119/v1/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer shim-secret",
        }),
        body: JSON.stringify({ session_id: "s1", message: "hello" }),
      }),
    );
    expect(reply).toEqual({ assistantText: "hi", elapsedMs: 42 });
  });

  it("throws ShimError on non-2xx with detail", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => JSON.stringify({ detail: "hermes returned 1: boom" }),
    });
    await expect(client.chat({ session_id: "s1", message: "x" }))
      .rejects.toMatchObject({ status: 502, detail: "hermes returned 1: boom" });
  });

  it("throws ShimError on empty/non-JSON response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "<html>oops</html>",
    });
    await expect(client.chat({ session_id: "s1", message: "x" }))
      .rejects.toMatchObject({ status: 500 });
  });
});
