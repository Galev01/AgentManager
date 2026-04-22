"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons, type IconName } from "./icons";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
}

interface NavSection {
  group: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    group: "Monitor",
    items: [
      { id: "overview",      label: "Overview",      href: "/",                 icon: "home"     },
      { id: "conversations", label: "Conversations", href: "/conversations",    icon: "chat"     },
      { id: "claude_code",   label: "Claude Code",   href: "/claude-code",      icon: "code"     },
      { id: "review_inbox",  label: "Review Inbox",  href: "/reviews/inbox",    icon: "review"   },
    ],
  },
  {
    group: "Runtime",
    items: [
      { id: "agents",   label: "Agents",        href: "/agents",   icon: "agents"   },
      { id: "sessions", label: "Sessions",      href: "/sessions", icon: "sessions" },
      { id: "youtube",  label: "YouTube Relay", href: "/youtube",  icon: "yt"       },
      { id: "cron",     label: "Cron",          href: "/cron",     icon: "cron"     },
    ],
  },
  {
    group: "Configure",
    items: [
      { id: "channels", label: "Channels",      href: "/channels",    icon: "channels" },
      { id: "tools",    label: "Tools",         href: "/tools",       icon: "tools"    },
      { id: "routing",  label: "Routing Rules", href: "/routing",     icon: "rules"    },
      { id: "brain",       label: "Brain · People", href: "/brain/people", icon: "brain" },
      { id: "brain-agent", label: "Brain · Global", href: "/brain/agent",  icon: "brain" },
    ],
  },
  {
    group: "Advanced",
    items: [
      { id: "capabilities", label: "Capabilities", href: "/capabilities", icon: "caps"     },
      { id: "commands",     label: "Commands",     href: "/commands",     icon: "cmd"      },
      { id: "config",       label: "Raw Config",   href: "/config",       icon: "config"   },
      { id: "settings",     label: "Settings",     href: "/settings",     icon: "settings" },
    ],
  },
];

export function Sidebar({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <aside className="sb">
      {/* Brand */}
      <div className="sb-brand">
        <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="sb-logo-img" />
        <div className="sb-name">OpenClaw</div>
      </div>

      {/* Nav groups */}
      <div className="sb-scroll">
        {NAV.map((sec) => (
          <div className="sb-sec" key={sec.group}>
            <div className="sb-sec-h">{sec.group}</div>
            {sec.items.map((item) => {
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
        ))}
      </div>

      {/* Footer */}
      <div className="sb-foot">
        <div className="sb-foot-avatar">OC</div>
        <div className="sb-foot-text">
          <div className="n">OpenClaw</div>
          <div className="s mono">local · :7321</div>
        </div>
      </div>
    </aside>
  );
}
