"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  Check,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { signOutAction, switchWorkspaceAction } from "@/lib/auth/actions";
import { getPlan, isUnlimited, limitFor, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { APP_NAV, isNavActive, type AppNavItem } from "./nav";
import { ProductSwitcher } from "./ProductSwitcher";
import { useThemePreference } from "./ThemeToggle";
import { isThemePreference } from "./theme";
import type { ShellProduct, ShellUser, ShellWorkspace } from "./types";

export type { ShellProduct, ShellUser, ShellWorkspace } from "./types";

export interface AppShellProps {
  children: React.ReactNode;
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  products: ShellProduct[];
  activeProductId: string | null;
  plan: PlanId;
  /** Days left on the free Pro trial, or null when the workspace is not trialing. */
  trialDaysLeft?: number | null;
}

/**
 * Authenticated app chrome: 240 px sidebar (a drawer below lg), 56 px topbar with the
 * product switcher and user menu, and a max-width content column with page gutters.
 * Pages render their own PageHeader inside `children`.
 */
export function AppShell({
  children,
  user,
  workspace,
  workspaces,
  products,
  activeProductId,
  plan,
  trialDaysLeft = null,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Close the mobile drawer whenever navigation happens.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const productLimit = limitFor(plan, "products");
  const canAddProduct = isUnlimited(productLimit) || products.length < productLimit;

  const sidebar = (
    <SidebarContent
      pathname={pathname}
      workspace={workspace}
      workspaces={workspaces}
      plan={plan}
      trialDaysLeft={trialDaysLeft}
    />
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className={cn(
          "focus-ring sr-only z-toast rounded-md bg-surface px-3 py-2 text-sm font-medium text-ink shadow-md",
          "focus:not-sr-only focus:fixed focus:left-4 focus:top-3",
        )}
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        aria-label="Main navigation"
        className="fixed inset-y-0 left-0 z-drawer hidden w-[var(--sidebar-width)] flex-col border-r border-line bg-surface lg:flex"
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-drawer bg-ink/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in dark:bg-black/60 lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              "fixed inset-y-0 left-0 z-drawer flex w-[min(280px,calc(100vw-48px))] flex-col border-r border-line bg-surface shadow-lg outline-none lg:hidden",
              "data-[state=open]:animate-drawer-in data-[state=closed]:animate-fade-out",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="focus-ring absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors duration-120 hover:bg-sunken hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </DialogPrimitive.Close>
            {sidebar}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-h-dvh flex-col lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-topbar flex h-[var(--topbar-height)] shrink-0 items-center gap-2 border-b border-line bg-topbar px-3 sm:px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-secondary transition-colors duration-120 hover:bg-sunken hover:text-ink lg:hidden"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <ProductSwitcher
              products={products}
              activeProductId={activeProductId}
              canAddProduct={canAddProduct}
            />
          </div>
          <UserMenu user={user} />
        </header>

        <main id="main" tabIndex={-1} className="container-app flex-1 py-6 outline-none sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  workspace,
  workspaces,
  plan,
  trialDaysLeft,
}: {
  pathname: string | null;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  plan: PlanId;
  trialDaysLeft: number | null;
}) {
  const main = APP_NAV.filter((item) => item.group === "main");
  const settings = APP_NAV.filter((item) => item.group === "workspace");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--topbar-height)] shrink-0 items-center border-b border-line px-4">
        <Link href="/dashboard" className="focus-ring -mx-1 rounded-md px-1 py-1" aria-label="BuildMonday dashboard">
          <Wordmark />
        </Link>
      </div>

      <nav aria-label="App" className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        <NavList items={main} pathname={pathname} />
        <p className="mb-1 mt-6 px-2 text-xs font-medium text-ink-muted">Workspace</p>
        <NavList items={settings} pathname={pathname} />
        <Link
          href="/app"
          className="focus-ring mt-0.5 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-ink-secondary transition-colors duration-120 ease-standard hover:bg-sunken hover:text-ink"
        >
          <ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="truncate">Free analyzer</span>
          <span className="sr-only">(opens the public analyzer, outside the app)</span>
        </Link>
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <WorkspaceMenu workspace={workspace} workspaces={workspaces} plan={plan} />
        {trialDaysLeft !== null ? (
          <Link
            href="/billing?plan=pro&interval=year"
            className="focus-ring mt-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-ink-secondary transition-colors duration-120 hover:bg-sunken hover:text-ink"
          >
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-brand" />
              Pro trial, {trialDaysLeft === 1 ? "last day" : `${trialDaysLeft} days left`}
            </span>
            <span className="font-medium text-brand">Keep Pro</span>
          </Link>
        ) : plan === "free" ? (
          <Link
            href="/billing?plan=pro&interval=month"
            className="focus-ring mt-2 flex items-center justify-between rounded-md border border-line bg-sunken px-3 py-2 text-sm transition-colors duration-120 hover:border-line-strong"
          >
            <span>
              <span className="block font-medium text-ink">Daily monitoring</span>
              <span className="block text-xs text-ink-muted">Alerts and auto-filing on Pro</span>
            </span>
            <ArrowUpRight aria-hidden className="size-4 shrink-0 text-brand" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function NavList({ items, pathname }: { items: AppNavItem[]; pathname: string | null }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium",
                "transition-colors duration-120 ease-standard",
                active
                  ? "bg-brand-soft text-brand-ink"
                  : "text-ink-secondary hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-brand" : "text-ink-muted")} />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function PlanPill({ plan, className }: { plan: PlanId; className?: string }) {
  const name = getPlan(plan).name;
  if (plan === "team") {
    return (
      <Badge tone="neutral" variant="solid" size="sm" className={className}>
        {name}
      </Badge>
    );
  }
  if (plan === "pro") {
    return (
      <Badge tone="brand" variant="soft" size="sm" className={className}>
        {name}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" variant="outline" size="sm" className={className}>
      {name}
    </Badge>
  );
}

function WorkspaceMenu({
  workspace,
  workspaces,
  plan,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  plan: PlanId;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const body = (
    <>
      <span
        aria-hidden
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-ink font-display text-xs font-semibold text-canvas"
      >
        {workspace.name.trim().charAt(0).toUpperCase() || "W"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{workspace.name}</span>
        <span className="mt-0.5 block">
          <PlanPill plan={plan} />
        </span>
      </span>
    </>
  );

  if (workspaces.length <= 1) {
    return <div className="flex items-center gap-2.5 px-1 py-1">{body}</div>;
  }

  function switchTo(id: string) {
    if (id === workspace.id) return;
    startTransition(async () => {
      try {
        const result = await switchWorkspaceAction(id);
        if (!result.ok) {
          toast.error("Could not switch workspace. Refresh the page and try again.");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } catch {
        toast.error("Could not switch workspace. Check your connection and try again.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-ring flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors duration-120 hover:bg-sunken data-[state=open]:bg-sunken"
        aria-label={`Workspace: ${workspace.name}. Switch workspace`}
      >
        {body}
        {isPending ? (
          <Spinner size="sm" className="text-ink-muted" label="Switching workspace" />
        ) : (
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[216px]">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onSelect={() => switchTo(ws.id)}>
            <span className="truncate">{ws.name}</span>
            {ws.id === workspace.id ? <Check aria-hidden className="ml-auto size-4 text-brand" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [theme, setTheme] = useThemePreference();
  const [signingOut, startSignOut] = React.useTransition();

  function signOut() {
    startSignOut(async () => {
      try {
        await signOutAction();
      } catch (err) {
        // A redirect thrown by the action is how sign-out completes; anything else is a real failure.
        if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        toast.error("Sign-out did not complete. Try again.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity duration-120 hover:opacity-90"
        aria-label="Account menu"
      >
        {signingOut ? (
          <Spinner size="sm" className="text-ink-muted" label="Signing out" />
        ) : (
          <Avatar src={user.image} name={user.name} email={user.email} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[248px]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar src={user.image} name={user.name} email={user.email} />
          <div className="min-w-0">
            {user.name ? <p className="truncate text-sm font-medium text-ink">{user.name}</p> : null}
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild icon={Settings}>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild icon={CreditCard}>
          <Link href="/billing">Billing</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isThemePreference(value)) setTheme(value);
          }}
        >
          <DropdownMenuRadioItem value="system" onSelect={(e) => e.preventDefault()}>
            <span className="flex items-center gap-2">
              <Monitor aria-hidden className="size-4 text-ink-muted" />
              System
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" onSelect={(e) => e.preventDefault()}>
            <span className="flex items-center gap-2">
              <Sun aria-hidden className="size-4 text-ink-muted" />
              Light
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" onSelect={(e) => e.preventDefault()}>
            <span className="flex items-center gap-2">
              <Moon aria-hidden className="size-4 text-ink-muted" />
              Dark
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={LogOut} onSelect={signOut} disabled={signingOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
