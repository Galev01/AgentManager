"use client";
import { useState } from "react";
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
    group: "OpenClaw",
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

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

interface FlatItem extends NavItem {
  badge?: number;
  dim: boolean;
  sectionId: string;
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
  const pathname = usePathname() ?? "/";
  const have = new Set(permissions ?? []);
  const active = useActiveRuntime();
  const [hoverId, setHoverId] = useState<string | null>(null);

  const groups: { sectionId: string; items: FlatItem[] }[] = [];
  for (const sec of NAV) {
    const items = sec.items.filter((it) => have.has(it.perm));
    if (!items.length) continue;
    const dim =
      sec.runtimeKind != null &&
      active.kind != null &&
      active.kind !== sec.runtimeKind;
    groups.push({
      sectionId: sec.id,
      items: items.map((it) => ({ ...it, badge: badges[it.id], dim, sectionId: sec.id })),
    });
  }

  return (
    <nav className="v2-sb" aria-label="Primary">
      <Link href="/" className="v2-sb-mark" title="AgentManager">AM</Link>

      <div className="v2-sb-nav">
        {groups.map((g, gi) => (
          <div
            key={g.sectionId}
            style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            {gi > 0 && <div className="v2-sb-divider" />}
            {g.items.map((it) => {
              const Icon = Icons[it.icon];
              const itActive = isActivePath(pathname, it.href);
              return (
                <Link
                  key={it.id}
                  href={it.href}
                  className={`v2-nav-item${itActive ? " active" : ""}`}
                  style={it.dim ? { opacity: 0.55 } : undefined}
                  onMouseEnter={() => setHoverId(it.id)}
                  onMouseLeave={() => setHoverId((p) => (p === it.id ? null : p))}
                >
                  <Icon />
                  {it.badge ? (
                    <span
                      style={{
                        position: "absolute",
                        top: 2, right: 2,
                        background: "var(--warn)",
                        color: "var(--bg)",
                        fontSize: 9,
                        fontWeight: 700,
                        minWidth: 14, height: 14,
                        borderRadius: 999,
                        display: "grid",
                        placeItems: "center",
                        padding: "0 4px",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {it.badge}
                    </span>
                  ) : null}
                  {hoverId === it.id && <span className="v2-tooltip">{it.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="v2-sb-foot">
        {currentUser ? (
          <UserMenu username={currentUser.username} displayName={currentUser.displayName} />
        ) : (
          <div className="v2-sb-mark" style={{ width: 32, height: 32, fontSize: 10 }}>·</div>
        )}
      </div>
    </nav>
  );
}
