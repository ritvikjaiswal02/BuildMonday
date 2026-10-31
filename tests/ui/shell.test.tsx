// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/issues/123",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/actions", () => ({
  setActiveProductAction: vi.fn(async () => ({ ok: true })),
  switchWorkspaceAction: vi.fn(async () => ({ ok: true })),
  signOutAction: vi.fn(async () => undefined),
}));

import { AppShell } from "@/components/shell/AppShell";
import { AppHeader } from "@/components/AppHeader";
import { TooltipProvider } from "@/components/ui/tooltip";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  function renderShell(plan: "free" | "pro" | "team" = "free") {
    return render(
      <TooltipProvider>
        <AppShell
          user={{ id: "u1", name: "Ritvik Jaiswal", email: "ritvik@example.com", image: null }}
          workspace={{ id: "w1", name: "Ritvik's workspace" }}
          workspaces={[{ id: "w1", name: "Ritvik's workspace" }]}
          products={[{ id: "p1", name: "Acme Notes" }]}
          activeProductId="p1"
          plan={plan}
        >
          <h1>Issues</h1>
        </AppShell>
      </TooltipProvider>,
    );
  }

  it("renders navigation with the active section marked", () => {
    renderShell();
    const current = screen.getByRole("link", { name: "Issues", current: "page" });
    expect(current).toHaveAttribute("href", "/issues");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("shows the active product, the workspace plan and the page content", () => {
    renderShell();
    expect(screen.getByRole("button", { name: /Product: Acme Notes/ })).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Issues" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });

  it("hides the upgrade prompt on paid plans", () => {
    renderShell("pro");
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText("Daily monitoring")).toBeNull();
  });
});

describe("AppHeader", () => {
  it("treats a failed session request as signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    render(<AppHeader />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Start free" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/login?next=/onboarding");
  });

  it("links signed-in visitors to the dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: { email: "a@b.co" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    render(<AppHeader actions={<button type="button">Share</button>} />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Open dashboard" })).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Share" }).length).toBeGreaterThan(0);
  });
});
