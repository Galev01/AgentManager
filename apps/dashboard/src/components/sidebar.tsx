"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUserPublic, PermissionId, RuntimeKind } from "@openclaw-manager/types";
import { Icons, type IconName } from "./icons";
import { UserMenu } from "./user-menu";
import { useActiveRuntime } from "@/hooks/use-active-runtime";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  perm: PermissionId;
}

interface NavSection {
  id: string;
  group: string;
  items: NavItem[];
  runtimeKind?: RuntimeKind;
}

const NAV: NavSection[] = [
  {
    id: "monitor",
    group: "Monitor",
    items: [
      { id: "overview",      label: "Overview",      href: "/",                 icon: "home",     perm: "overview.view"        },
      { id: "claude_code",   label: "Claude Code",   href: "/claude-code",      icon: "code",     perm: "claude_code.view"     },
      { id: "review_inbox",  label: "Review Inbox",  href: "/reviews/inbox",    icon: "review",   perm: "reviews.view"         },
    ],
  },
  {
    id: "runtime",
    group: "Runtime",
    items: [
      { id: "runtimes", label: "Runtimes",      href: "/runtimes", icon: "bolt",     perm: "runtimes.view"       },
      { id: "agents",   label: "Agents",        href: "/agents",   icon: "agents",   perm: "agents.view"         },
      { id: "sessions", label: "Sessions",      href: "/sessions", icon: "sessions", perm: "agent_sessions.view" },
      { id: "youtube",  label: "YouTube Relay", href: "/youtube",  icon: "yt",       perm: "youtube.view"        },
      { id: "cron",     label: "Cron",          href: "/cron",     icon: "cron",     perm: "cron.view"           },
    ],
  },
  {
    id: "openclaw",
    group: "OpenClaw Integrations",
    runtimeKind: "openclaw",
    items: [
      { id: "conversations", label: "Conversations", href: "/conversations", icon: "chat",     perm: "conversations.view" },
      { id: "channels",      label: "Channels",      href: "/channels",      icon: "channels", perm: "channels.view"      },
      { id: "relay",         label: "Relay",         href: "/relay",         icon: "rules",    perm: "relay.view"         },
      { id: "routing",       label: "Routing Rules", href: "/routing",       icon: "rules",    perm: "routing.view"       },
    ],
  },
  {
    id: "configure",
    group: "Configure",
    items: [
      { id: "tools",       label: "Tools",          href: "/tools",         icon: "tools",    perm: "tools.view"         },
      { id: "brain",       label: "Brain · People", href: "/brain/people",  icon: "brain",    perm: "brain.people.read"  },
      { id: "brain-agent", label: "Brain · Global", href: "/brain/agent",   icon: "brain",    perm: "brain.global.read"  },
    ],
  },
  {
    id: "advanced",
    group: "Advanced",
    items: [
      { id: "capabilities", label: "Capabilities", href: "/capabilities", icon: "caps",     perm: "capabilities.view" },
      { id: "commands",     label: "Commands",     href: "/commands",     icon: "cmd",      perm: "commands.run"      },
      { id: "config",       label: "Raw Config",   href: "/config",       icon: "config",   perm: "config.raw.read"   },
      { id: "settings",     label: "Settings",     href: "/settings",     icon: "settings", perm: "settings.read"     },
      { id: "logs",         label: "Logs",         href: "/logs",         icon: "logs",     perm: "logs.read"         },
    ],
  },
  {
    id: "admin",
    group: "Admin",
    items: [
      { id: "admin_users",     label: "Users",     href: "/admin/users",    icon: "config", perm: "auth.users.read"     },
      { id: "admin_roles",     label: "Roles",     href: "/admin/roles",    icon: "config", perm: "auth.roles.read"     },
      { id: "admin_providers", label: "Providers", href: "/admin/auth",     icon: "config", perm: "auth.providers.read" },
      { id: "admin_audit",     label: "Audit",     href: "/admin/audit",    icon: "logs",   perm: "auth.audit.read"     },
    ],
  },
];

const STORAGE_KEY = "openclaw.dashboard.sidebar.sections";

function getDefaultOpen(sectionId: string, activeKind: RuntimeKind | null): boolean {
  if (sectionId === "openclaw") return activeKind === "openclaw";
  if (sectionId === "advanced" || sectionId === "admin") return false;
  return true;
}

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Chevron SVG — inline to avoid icon-map coupling
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`sb-sec-chevron${open ? " sb-sec-chevron--open" : ""}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Sidebar({
  badges = {},
  currentUser,
  permissions,
}: {
  badges?: Record<string, number>;
  currentUser?: AuthUserPublic | null;
  permissions?: PermissionId[];
}) {
  const pathname = usePathname();
  const have = new Set(permissions ?? []);
  const active = useActiveRuntime();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOpenSections(JSON.parse(raw));
    } catch {}
    setMounted(true);
  }, []);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const currentDefault = getDefaultOpen(id, active.kind);
      const next = { ...prev, [id]: !(prev[id] ?? currentDefault) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  return (
    <aside className="sb">
      {/* Brand */}
      <div className="sb-brand">
        {/* Icon-only mark (themes A + C) */}
        <div className="sb-logo-mark">AM</div>
        {/* Full logo (theme B wide sidebar) */}
        <img src="/ManageClaw-TB-DarkMode.png" alt="AgentManager" className="sb-logo-img" />
        <div className="sb-name">AgentManager</div>
      </div>

      {/* Nav groups */}
      <div className="sb-scroll">
        {NAV.map((sec) => {
          const items = sec.items.filter((it) => have.has(it.perm));
          if (items.length === 0) return null;

          const dim =
            sec.runtimeKind != null &&
            active.kind != null &&
            active.kind !== sec.runtimeKind;

          const hasActiveItem = items.some((it) => isActivePath(pathname, it.href));
          const forcedOpen = hasActiveItem;
          const userPref = mounted ? openSections[sec.id] : undefined;
          const defaultOpen = getDefaultOpen(sec.id, active.kind);
          const isOpen = forcedOpen || (userPref ?? defaultOpen);

          // Sum badges for items in this section (shown on collapsed header)
          const sectionBadgeTotal = items.reduce((sum, it) => sum + (badges[it.id] ?? 0), 0);

          const sectionTitle =
            sec.runtimeKind != null && dim
              ? `${sec.group} — only available when active runtime is ${sec.runtimeKind}`
              : undefined;

          return (
            <div
              className="sb-sec"
              key={sec.id}
              style={dim && !hasActiveItem ? { opacity: 0.55 } : undefined}
            >
              <button
                type="button"
                className="sb-sec-h"
                onClick={() => toggleSection(sec.id)}
                aria-expanded={isOpen}
                aria-controls={`sb-sec-${sec.id}`}
                title={sectionTitle}
              >
                <span>{sec.group}</span>
                {!isOpen && sectionBadgeTotal > 0 && (
                  <span className="sb-sec-badge">{sectionBadgeTotal}</span>
                )}
                <Chevron open={isOpen} />
              </button>

              <div
                id={`sb-sec-${sec.id}`}
                className={`sb-sec-body${isOpen ? " sb-sec-body--open" : ""}`}
              >
                {items.map((item) => {
                  const itemActive = isActivePath(pathname, item.href);
                  const IconComponent = Icons[item.icon];
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`sb-item${itemActive ? " active" : ""}`}
                      title={item.label}
                    >
                      <IconComponent />
                      <span>{item.label}</span>
                      {badges[item.id] ? (
                        <span
                          className="sb-badge"
                          style={{
                            marginLeft: "auto",
                            background: "var(--warn-dim)",
                            color: "var(--warn)",
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 999,
                            fontFamily: "var(--font-mono, JetBrains Mono), monospace",
                            fontWeight: 500,
                          }}
                        >
                          {badges[item.id]}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="sb-foot">
        {currentUser ? (
          <UserMenu username={currentUser.username} displayName={currentUser.displayName} />
        ) : (
          <>
            <div className="sb-foot-avatar">AM</div>
            <div className="sb-foot-text">
              <div className="n">AgentManager</div>
              <div className="s mono">local · :7321</div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
