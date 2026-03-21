"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/game-library", label: "Games" },
  { href: "/prompts", label: "GM Tuning" },
  { href: "/baby-ai", label: "Baby AI" },
  { href: "/cards", label: "Cards" },
  { href: "/settings", label: "Settings" },
  { href: "/hardware", label: "Hardware" },
  { href: "/memory", label: "Memory" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center justify-between px-5 py-2.5"
      style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
    >
      <Link
        href="/game-library"
        className="text-lg font-bold tracking-wide"
        style={{ color: "var(--accent)" }}
      >
        TTDND
      </Link>

      <div className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                color: active ? "white" : "var(--text-secondary)",
                background: active ? "var(--accent)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "var(--text-primary)";
                  e.currentTarget.style.background = "var(--bg-card)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
