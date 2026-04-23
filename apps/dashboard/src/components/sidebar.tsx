"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUserPublic, PermissionId } from "@openclaw-manager/types";
import { Icons, type IconName } from "./icons";
import { UserMenu } from "./user-menu";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  perm: PermissionId;
}

interface NavSection {
  group: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    group: "Monitor",
    items: [
      { id: "overview",      label: "Overview",      href: "/",                 icon: "home",     perm: "overview.view"        },
      { id: "conversations", label: "Conversations", href: "/conversations",    icon: "chat",     perm: "conversations.view"   },
      { id: "claude_code",   label: "Claude Code",   href: "/claude-code",      icon: "code",     perm: "claude_code.view"     },
      { id: "review_inbox",  label: "Review Inbox",  href: "/reviews/inbox",    icon: "review",   perm: "reviews.view"         },
    ],
  },
  {
    group: "Runtime",
    items: [
      { id: "agents",   label: "Agents",        href: "/agents",   icon: "agents",   perm: "agents.view"         },
      { id: "sessions", label: "Sessions",      href: "/sessions", icon: "sessions", perm: "agent_sessions.view" },
      { id: "youtube",  label: "YouTube Relay", href: "/youtube",  icon: "yt",       perm: "youtube.view"        },
      { id: "cron",     label: "Cron",          href: "/cron",     icon: "cron",     perm: "cron.view"           },
    ],
  },
  {
    group: "Configure",
    items: [
      { id: "channels", label: "Channels",      href: "/channels",    icon: "channels", perm: "channels.view"      },
      { id: "tools",    label: "Tools",         href: "/tools",       icon: "tools",    perm: "tools.view"         },
      { id: "routing",  label: "Routing Rules", href: "/routing",     icon: "rules",    perm: "routing.view"       },
      { id: "brain",       label: "Brain · People", href: "/brain/people", icon: "brain", perm: "brain.people.read" },
      { id: "brain-agent", label: "Brain · Global", href: "/brain/agent",  icon: "brain", perm: "brain.global.read" },
    ],
  },
  {
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
    group: "Admin",
    items: [
      { id: "admin_users",     label: "Users",     href: "/admin/users",    icon: "config", perm: "auth.users.read"     },
      { id: "admin_roles",     label: "Roles",     href: "/admin/roles",    icon: "config", perm: "auth.roles.read"     },
      { id: "admin_providers", label: "Providers", href: "/admin/auth",     icon: "config", perm: "auth.providers.read" },
      { id: "admin_audit",     label: "Audit",     href: "/admin/audit",    icon: "logs",   perm: "auth.audit.read"     },
    ],
  },
];

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

  return (
    <aside className="sb">
      {/* Brand */}
      <div className="sb-brand">
        <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="sb-logo-img" />
        <div className="sb-name">OpenClaw</div>
      </div>

      {/* Nav groups */}
      <div className="sb-scroll">
        {NAV.map((sec) => {
          const items = sec.items.filter((it) => have.has(it.perm));
          if (items.length === 0) return null;
          return (
            <div className="sb-sec" key={sec.group}>
              <div className="sb-sec-h">{sec.group}</div>
              {items.map((item) => {
                const isActive =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const IconComponent = Icons[item.icon];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`sb-item${isActive ? " active" : ""}`}
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
          );
        })}
      </div>

      {/* Footer */}
      <div className="sb-foot">
        {currentUser ? (
          <UserMenu username={currentUser.username} displayName={currentUser.displayName} />
        ) : (
          <>
            <div className="sb-foot-avatar">OC</div>
            <div className="sb-foot-text">
              <div className="n">OpenClaw</div>
              <div className="s mono">local · :7321</div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
