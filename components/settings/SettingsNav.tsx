"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Box, PlugZap, Rss, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const SETTINGS_NAV = [
  { href: "/settings", label: "Product", icon: Box },
  { href: "/settings/sources", label: "Sources", icon: Rss },
  { href: "/settings/alerts", label: "Alerts and filing", icon: Bell },
  { href: "/settings/integrations", label: "Integrations", icon: PlugZap },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/account", label: "Account", icon: UserRound },
] as const;

export function isSettingsActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/settings") return pathname === "/settings" || pathname === "/settings/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Underline tabs that scroll sideways below lg; a vertical list from lg. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="scrollbar-none -mx-4 flex gap-5 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0 lg:px-0">
        {SETTINGS_NAV.map((item) => {
          const active = isSettingsActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex items-center gap-2.5 whitespace-nowrap text-sm font-medium",
                  "transition-colors duration-120 ease-standard",
                  // Tabs below lg
                  "-mb-px h-10 rounded-sm border-b-2",
                  active ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink",
                  // List from lg
                  "lg:mb-0 lg:h-8 lg:rounded-md lg:border-b-0 lg:px-2",
                  active ? "lg:bg-brand-soft lg:text-brand-ink" : "lg:text-ink-secondary lg:hover:bg-sunken",
                )}
              >
                <Icon aria-hidden className={cn("hidden size-4 lg:block", active ? "text-brand" : "text-ink-muted")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
