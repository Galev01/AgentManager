# Back + Home Navigation Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contextual Back and Home icon buttons to the left side of the app header.

**Architecture:** Extend `header.tsx` with two icon buttons before the breadcrumb div. Logic is purely derived from `usePathname()` — no state, no history stack. Back navigates to the parent route segment; Home navigates to `/`. Both buttons are hidden when not applicable.

**Tech Stack:** Next.js App Router, `next/navigation`, Vitest, React Testing Library, Tailwind CSS

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/dashboard/src/components/header.tsx` |
| Create | `apps/dashboard/src/components/header.test.tsx` |

---

### Task 1: Write failing tests for nav button visibility

**Files:**
- Create: `apps/dashboard/src/components/header.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

describe("Header nav buttons", () => {
  it("hides both buttons on home page", () => {
    mockPathname = "/";
    render(<Header title="OpenClaw" />);
    expect(screen.queryByTitle("Go home")).toBeNull();
    expect(screen.queryByTitle("Go back")).toBeNull();
  });

  it("shows home button but hides back button on root-level page", () => {
    mockPathname = "/agents";
    render(<Header title="OpenClaw" />);
    expect(screen.getByTitle("Go home")).toBeTruthy();
    expect(screen.queryByTitle("Go back")).toBeNull();
  });

  it("shows both buttons on deep page", () => {
    mockPathname = "/agents/abc";
    render(<Header title="OpenClaw" />);
    expect(screen.getByTitle("Go home")).toBeTruthy();
    expect(screen.getByTitle("Go back")).toBeTruthy();
  });

  it("home button navigates to /", () => {
    mockPathname = "/agents";
    render(<Header title="OpenClaw" />);
    screen.getByTitle("Go home").click();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("back button navigates to parent path", () => {
    mockPathname = "/agents/abc";
    render(<Header title="OpenClaw" />);
    screen.getByTitle("Go back").click();
    expect(pushMock).toHaveBeenCalledWith("/agents");
  });

  it("back button strips only last segment on deep path", () => {
    mockPathname = "/agents/abc/sessions/123";
    render(<Header title="OpenClaw" />);
    screen.getByTitle("Go back").click();
    expect(pushMock).toHaveBeenCalledWith("/agents/abc/sessions");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/dashboard && npx vitest run src/components/header.test.tsx
```

Expected: all 6 tests FAIL — buttons don't exist yet.

---

### Task 2: Implement nav buttons in Header

**Files:**
- Modify: `apps/dashboard/src/components/header.tsx`

- [ ] **Step 3: Add nav button logic and JSX**

Replace the `Header` function in `apps/dashboard/src/components/header.tsx` with:

```tsx
export function Header({ title }: { title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const crumbs = useBreadcrumbs();

  const segments = pathname ? pathname.split("/").filter(Boolean) : [];
  const isHome = segments.length === 0;
  const isRoot = segments.length <= 1;
  const parentPath = "/" + segments.slice(0, -1).join("/");

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="hd">
      {/* Back / Home nav buttons */}
      {!isHome && (
        <button className="hd-btn" onClick={() => router.push("/")} title="Go home">
          <Icons.home />
        </button>
      )}
      {!isHome && !isRoot && (
        <button className="hd-btn" onClick={() => router.push(parentPath)} title="Go back">
          <span className="rotate-180 inline-flex"><Icons.right /></span>
        </button>
      )}

      {/* Breadcrumbs */}
      <div className="hd-crumb">
        <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="hd-logo-img" />
        <span>OpenClaw</span>
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: "contents" }}>
            <span className="sep">/</span>
            <span
              style={{
                color: i === crumbs.length - 1 ? "var(--text)" : undefined,
                fontWeight: i === crumbs.length - 1 ? 500 : undefined,
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="hd-spacer" />

      {/* Health strip (static — Task 2 will wire real data) */}
      <HealthStrip />

      {/* Active-runtime selector (Phase F) */}
      <Suspense fallback={null}>
        <RuntimeSelector />
      </Suspense>

      {/* Gateway status (existing component kept) */}
      <GatewayStatus />

      {/* AutoRefresh (existing, preserved) */}
      <AutoRefresh />

      {/* Logout */}
      <button className="hd-btn" onClick={handleLogout} title="Logout">
        <Icons.x />
        <span>Logout</span>
      </button>
    </header>
  );
}
```

Also update `useBreadcrumbs` to use the extracted `pathname` variable — but since the hook uses its own `usePathname()` call internally, no change needed there. The hook is separate and untouched.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/dashboard && npx vitest run src/components/header.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd apps/dashboard && npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/header.tsx apps/dashboard/src/components/header.test.tsx docs/superpowers/specs/2026-05-10-back-home-nav-design.md docs/superpowers/plans/2026-05-10-back-home-nav.md
git commit -m "feat(header): add contextual back and home nav buttons"
```
