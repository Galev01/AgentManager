import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Sidebar } from "./sidebar";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-active-runtime", () => ({
  useActiveRuntime: () => ({ kind: "openclaw" }),
}));

const ALL_PERMS = [
  "overview.view",
  "claude_code.view",
  "reviews.view",
  "runtimes.view",
  "agents.view",
  "agent_sessions.view",
  "youtube.view",
  "cron.view",
  "conversations.view",
  "channels.view",
  "relay.view",
  "routing.view",
  "tools.view",
  "brain.people.read",
  "brain.global.read",
  "capabilities.view",
  "commands.run",
  "config.raw.read",
  "settings.read",
  "logs.read",
  "auth.users.read",
  "auth.roles.read",
  "auth.providers.read",
  "auth.audit.read",
] as const;

function renderSidebar(pathname = "/") {
  mockPathname = pathname;
  return render(
    <Sidebar permissions={[...ALL_PERMS]} />
  );
}

beforeEach(() => {
  mockPathname = "/";
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Sidebar collapsible sections", () => {
  it("renders section headers as buttons with aria-expanded", () => {
    renderSidebar();
    const buttons = screen.getAllByRole("button", { name: /monitor|runtime|openclaw integrations|configure|advanced|admin/i });
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn).toHaveAttribute("aria-expanded");
    }
  });

  it("Monitor section is open by default", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /monitor/i });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /overview/i })).toBeVisible();
  });

  it("Advanced section is closed by default", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /advanced/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("Admin section is closed by default", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /^admin/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking a closed section opens it", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /advanced/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking an open section closes it (when no item in that section is active)", () => {
    // Use /settings so Monitor has no active item and can be toggled
    renderSidebar("/settings");
    const btn = screen.getByRole("button", { name: /monitor/i });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("persists open state to localStorage", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /advanced/i });
    fireEvent.click(btn);
    const stored = JSON.parse(localStorage.getItem("openclaw.dashboard.sidebar.sections") ?? "{}");
    expect(stored.advanced).toBe(true);
  });

  it("persists closed state to localStorage", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /monitor/i });
    fireEvent.click(btn);
    const stored = JSON.parse(localStorage.getItem("openclaw.dashboard.sidebar.sections") ?? "{}");
    expect(stored.monitor).toBe(false);
  });

  it("restores section state from localStorage on mount", async () => {
    localStorage.setItem(
      "openclaw.dashboard.sidebar.sections",
      JSON.stringify({ monitor: false, advanced: true })
    );
    // Use /agents so no Monitor item is active (Overview is "/" only) — avoids force-open
    renderSidebar("/agents");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /monitor/i })).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("button", { name: /advanced/i })).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("force-opens a section when the active route is inside it", async () => {
    localStorage.setItem(
      "openclaw.dashboard.sidebar.sections",
      JSON.stringify({ advanced: false })
    );
    renderSidebar("/settings");
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /advanced/i });
      expect(btn).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("shows aggregate badge count on collapsed section header when items have badges", async () => {
    // Use /agents so no Monitor item is active — allows Monitor to be closed
    mockPathname = "/agents";
    render(
      <Sidebar
        permissions={[...ALL_PERMS]}
        badges={{ claude_code: 3 }}
      />
    );
    const monitorBtn = screen.getByRole("button", { name: /monitor/i });
    fireEvent.click(monitorBtn);
    expect(monitorBtn).toHaveAttribute("aria-expanded", "false");
    // Badge count should be visible on the collapsed header
    expect(monitorBtn.textContent).toMatch(/3/);
  });
});
