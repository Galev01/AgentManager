import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { RuntimeHealthSnapshot } from "@/lib/runtime-client";
import { CapabilityGate } from "./capability-gate";

// useRuntimeHealth fetches /api/runtimes/health. We control the response per
// test via the global fetch mock to exercise the supported / partial /
// unsupported / fail-open branches uniformly.
const ORIGINAL_FETCH = globalThis.fetch;

function mockHealthOnce(snapshot: RuntimeHealthSnapshot) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => snapshot,
  })) as unknown as typeof fetch;
}

function mockHealthError() {
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: "x" }),
    text: async () => "x",
  })) as unknown as typeof fetch;
}

const baseSnapshot = (
  overrides: Partial<RuntimeHealthSnapshot["runtimes"][number]>,
): RuntimeHealthSnapshot => ({
  ok: true,
  primaryRuntimeId: "oc-main",
  runtimes: [
    {
      runtimeId: "oc-main",
      ok: true,
      status: "healthy",
      capabilities: {
        supported: ["agents.list"],
        partial: [],
        unsupported: [],
        version: "1",
        source: "static-adapter",
        stale: false,
      },
      ...overrides,
    } as RuntimeHealthSnapshot["runtimes"][number],
  ],
});

describe("CapabilityGate", () => {
  beforeEach(() => {
    // jsdom doesn't define fetch; ensure we always have a clean stub.
    globalThis.fetch = ORIGINAL_FETCH ?? (vi.fn() as unknown as typeof fetch);
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = ORIGINAL_FETCH ?? (vi.fn() as unknown as typeof fetch);
    vi.restoreAllMocks();
  });

  it("renders children when capability is supported", async () => {
    mockHealthOnce(baseSnapshot({}));
    render(
      <CapabilityGate runtimeId="oc-main" capabilityId="agents.list">
        <div data-testid="child">child</div>
      </CapabilityGate>,
    );
    await waitFor(() => expect(screen.getByTestId("child")).toBeInTheDocument());
    expect(screen.queryByText(/Not supported/i)).toBeNull();
    expect(screen.queryByText(/Partial/)).toBeNull();
  });

  it("renders partial badge with reason and still shows children", async () => {
    mockHealthOnce(
      baseSnapshot({
        capabilities: {
          supported: [],
          partial: [
            {
              id: "agents.list",
              reason: "no pagination exposed",
              projectionMode: "partial",
              lossiness: "lossy",
            },
          ],
          unsupported: [],
          version: "1",
          source: "static-adapter",
          stale: false,
        },
      } as Partial<RuntimeHealthSnapshot["runtimes"][number]>),
    );
    render(
      <CapabilityGate runtimeId="oc-main" capabilityId="agents.list">
        <div data-testid="child">child</div>
      </CapabilityGate>,
    );
    await waitFor(() => expect(screen.getByText(/no pagination exposed/i)).toBeInTheDocument());
    expect(screen.getByText(/Partial/)).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders default unsupported fallback when capability is unsupported", async () => {
    mockHealthOnce(
      baseSnapshot({
        capabilities: {
          supported: [],
          partial: [],
          unsupported: ["agents.list"],
          version: "1",
          source: "static-adapter",
          stale: false,
        },
      } as Partial<RuntimeHealthSnapshot["runtimes"][number]>),
    );
    render(
      <CapabilityGate runtimeId="oc-main" capabilityId="agents.list">
        <div data-testid="child">child</div>
      </CapabilityGate>,
    );
    await waitFor(() => expect(screen.getByText(/Not supported on/i)).toBeInTheDocument());
    expect(screen.queryByTestId("child")).toBeNull();
  });

  it("uses caller-supplied unsupportedFallback when provided", async () => {
    mockHealthOnce(
      baseSnapshot({
        capabilities: {
          supported: [],
          partial: [],
          unsupported: ["agents.list"],
          version: "1",
          source: "static-adapter",
          stale: false,
        },
      } as Partial<RuntimeHealthSnapshot["runtimes"][number]>),
    );
    render(
      <CapabilityGate
        runtimeId="oc-main"
        capabilityId="agents.list"
        unsupportedFallback={<div data-testid="custom-fallback">custom</div>}
      >
        <div>child</div>
      </CapabilityGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Not supported on/i)).toBeNull();
  });

  it("fails open: renders children when health endpoint errors", async () => {
    mockHealthError();
    render(
      <CapabilityGate runtimeId="oc-main" capabilityId="agents.list">
        <div data-testid="child">child</div>
      </CapabilityGate>,
    );
    // First render shows children due to isLoading-no-snapshot fallthrough.
    expect(screen.getByTestId("child")).toBeInTheDocument();
    // Even after the failed fetch settles, child remains.
    await waitFor(() => expect(screen.getByTestId("child")).toBeInTheDocument());
    expect(screen.queryByText(/Not supported on/i)).toBeNull();
  });

  it("renders children when runtimeId is unknown to the snapshot", async () => {
    mockHealthOnce(baseSnapshot({}));
    render(
      <CapabilityGate runtimeId="unknown-runtime" capabilityId="agents.list">
        <div data-testid="child">child</div>
      </CapabilityGate>,
    );
    await waitFor(() => expect(screen.getByTestId("child")).toBeInTheDocument());
    expect(screen.queryByText(/Not supported on/i)).toBeNull();
  });
});
