import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RuntimeHealthSnapshot } from "@/lib/runtime-client";
import { RuntimeSelector } from "./runtime-selector";

// Capture push() calls so we can assert URL writes. usePathname /
// useSearchParams are stubbed with controllable values per test.
const pushMock = vi.fn();
let mockPathname = "/agents";
let mockSearchString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearchString),
}));

const ORIGINAL_FETCH = globalThis.fetch;

function mockHealth(snapshot: RuntimeHealthSnapshot) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => snapshot,
  })) as unknown as typeof fetch;
}

const buildSnapshot = (): RuntimeHealthSnapshot => ({
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
    },
    {
      runtimeId: "hermes-prod",
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
    },
  ],
});

describe("RuntimeSelector", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockPathname = "/agents";
    mockSearchString = "";
    mockHealth(buildSnapshot());
  });
  afterEach(() => {
    cleanup();
    globalThis.fetch = ORIGINAL_FETCH ?? (vi.fn() as unknown as typeof fetch);
    vi.restoreAllMocks();
  });

  it("defaults the dropdown to primaryRuntimeId when ?runtimeId= is absent", async () => {
    render(<RuntimeSelector />);
    const select = (await waitFor(() =>
      screen.getByLabelText("Active runtime"),
    )) as HTMLSelectElement;
    expect(select.value).toBe("oc-main");
  });

  it("reflects the URL ?runtimeId= when present", async () => {
    mockSearchString = "runtimeId=hermes-prod";
    render(<RuntimeSelector />);
    const select = (await waitFor(() =>
      screen.getByLabelText("Active runtime"),
    )) as HTMLSelectElement;
    expect(select.value).toBe("hermes-prod");
  });

  it("pushes a URL with ?runtimeId= when switching to a non-primary runtime", async () => {
    render(<RuntimeSelector />);
    const select = (await waitFor(() =>
      screen.getByLabelText("Active runtime"),
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hermes-prod" } });
    expect(pushMock).toHaveBeenCalledWith("/agents?runtimeId=hermes-prod");
  });

  it("strips ?runtimeId= when switching back to the primary runtime", async () => {
    mockSearchString = "runtimeId=hermes-prod";
    render(<RuntimeSelector />);
    const select = (await waitFor(() =>
      screen.getByLabelText("Active runtime"),
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "oc-main" } });
    expect(pushMock).toHaveBeenCalledWith("/agents");
  });
});
