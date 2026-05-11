import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Header } from "./header";

const pushMock = vi.fn();
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

// Stub child components that make network calls or use contexts we don't care about
vi.mock("./auto-refresh", () => ({ AutoRefresh: () => null }));
vi.mock("./gateway-status", () => ({ GatewayStatus: () => null }));
vi.mock("./runtime/runtime-selector", () => ({ RuntimeSelector: () => null }));

beforeEach(() => {
  mockPathname = "/";
  pushMock.mockReset();
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

describe("Header nav buttons", () => {
  it("hides both buttons on home page", () => {
    render(<Header title="OpenClaw" />);
    expect(screen.queryByTitle("Go home")).toBeNull();
    expect(screen.queryByTitle("Go back")).toBeNull();
  });

  it("shows home button but hides back button on root-level page", () => {
    mockPathname = "/agents";
    render(<Header title="OpenClaw" />);
    expect(screen.getByTitle("Go home")).toBeInTheDocument();
    expect(screen.queryByTitle("Go back")).toBeNull();
  });

  it("shows both buttons on deep page", () => {
    mockPathname = "/agents/abc";
    render(<Header title="OpenClaw" />);
    expect(screen.getByTitle("Go home")).toBeInTheDocument();
    expect(screen.getByTitle("Go back")).toBeInTheDocument();
  });

  it("home button navigates to /", () => {
    mockPathname = "/agents";
    render(<Header title="OpenClaw" />);
    fireEvent.click(screen.getByTitle("Go home"));
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("back button navigates to parent path", () => {
    mockPathname = "/agents/abc";
    render(<Header title="OpenClaw" />);
    fireEvent.click(screen.getByTitle("Go back"));
    expect(pushMock).toHaveBeenCalledWith("/agents");
  });

  it("back button strips only last segment on deep path", () => {
    mockPathname = "/agents/abc/sessions/123";
    render(<Header title="OpenClaw" />);
    fireEvent.click(screen.getByTitle("Go back"));
    expect(pushMock).toHaveBeenCalledWith("/agents/abc/sessions");
  });
});
