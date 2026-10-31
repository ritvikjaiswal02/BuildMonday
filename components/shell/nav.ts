import {
  CreditCard,
  History,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  Puzzle,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface AppNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "main" | "workspace";
}

export const APP_NAV: AppNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/inbox", label: "Inbox", icon: Inbox, group: "main" },
  { href: "/issues", label: "Issues", icon: ListOrdered, group: "main" },
  { href: "/runs", label: "Runs", icon: History, group: "main" },
  { href: "/settings", label: "Settings", icon: Settings, group: "workspace" },
  { href: "/extension", label: "Extension & widget", icon: Puzzle, group: "workspace" },
  { href: "/billing", label: "Billing", icon: CreditCard, group: "workspace" },
];

/** True when `pathname` is the item's route or a child of it. */
export function isNavActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  const clean = pathname.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  return clean === href || clean.startsWith(`${href}/`);
}
