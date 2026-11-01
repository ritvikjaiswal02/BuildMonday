// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/script", () => ({ default: () => null }));

import { PaywallGate, PlanBadge, UpgradeDialog, UsageMeter, useUpgradeDialog } from "@/components/billing";
import { BillingView } from "@/components/billing/BillingView";
import { invalidateBillingSnapshot } from "@/components/billing/use-billing-snapshot";
import type { BillingState, BillingUsage } from "@/components/billing/types";

function mockStatus(body: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  invalidateBillingSnapshot();
  mockStatus({ plan: "free", suggestedCurrency: "INR", currency: null, canManage: true, billingEnabled: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlanBadge", () => {
  it("names the plan", () => {
    render(
      <>
        <PlanBadge plan="free" />
        <PlanBadge plan="pro" />
        <PlanBadge plan="team" size="sm" />
      </>,
    );
    expect(screen.getByText("Free").className).toContain("border");
    expect(screen.getByText("Pro").className).toContain("bg-brand-soft");
    expect(screen.getByText("Team").className).toContain("bg-ink");
  });
});

describe("UsageMeter", () => {
  it("shows figures and a bar", () => {
    render(<UsageMeter label="Feedback" used={412} limit={500} unit="feedback items" />);
    expect(screen.getByText("412 of 500 feedback items")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "412");
    expect(bar).toHaveAttribute("aria-valuemax", "500");
    expect(screen.getByText("88 left")).toBeInTheDocument();
  });

  it("says when the limit is reached", () => {
    render(<UsageMeter label="Manual runs" used={4} limit={4} compact />);
    expect(screen.getByText("Limit reached")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").firstElementChild?.className).toContain("bg-danger");
  });

  it("draws no bar when unlimited", () => {
    render(<UsageMeter label="PRDs" used={12} limit={-1} unit="PRDs" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("12 PRDs")).toBeInTheDocument();
  });
});

describe("PaywallGate", () => {
  it("renders children when the plan has the feature", () => {
    render(
      <PaywallGate feature="slack_alerts" plan="pro">
        <button type="button">Connect Slack</button>
      </PaywallGate>,
    );
    expect(screen.getByRole("button", { name: "Connect Slack" })).toBeInTheDocument();
  });

  it("replaces children with a callout on Free and opens the upgrade dialog", async () => {
    render(
      <PaywallGate feature="slack_alerts" plan="free">
        <button type="button">Connect Slack</button>
      </PaywallGate>,
    );
    expect(screen.queryByRole("button", { name: "Connect Slack" })).toBeNull();
    expect(screen.getByText("Slack alerts are on Pro and Team.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Upgrade to Pro" })).toBeInTheDocument();
    const link = within(dialog).getByRole("link", { name: "Upgrade to Pro" });
    expect(link).toHaveAttribute("href", "/billing?plan=pro&interval=month");
    expect(within(dialog).getByRole("link", { name: "Compare plans" })).toHaveAttribute("href", "/pricing");
    await waitFor(() => expect(within(dialog).getByText("₹1,499 / month")).toBeInTheDocument());
  });

  it("shows a one-line note in inline mode", () => {
    render(
      <PaywallGate feature="export" plan="free" mode="inline" description="Export is on Pro and Team.">
        {null}
      </PaywallGate>,
    );
    expect(screen.getByText("Export is on Pro and Team.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade" })).toBeInTheDocument();
  });

  it("dims and disables children in overlay mode", () => {
    render(
      <PaywallGate feature="auto_file" plan="free" mode="overlay" title="Auto-filing is on Pro and Team">
        <button type="button">Save</button>
      </PaywallGate>,
    );
    const hidden = screen.getByText("Save").closest("[inert]");
    expect(hidden).not.toBeNull();
    expect(screen.getByRole("group", { name: "Auto-filing is on Pro and Team" })).toBeInTheDocument();
  });

  it("renders the fallback when given", () => {
    render(
      <PaywallGate feature="export" plan="free" fallback={<p>Exports need Pro.</p>}>
        <button type="button">Export</button>
      </PaywallGate>,
    );
    expect(screen.getByText("Exports need Pro.")).toBeInTheDocument();
  });
});

describe("UpgradeDialog", () => {
  it("highlights the limit that was hit and targets the next plan", async () => {
    mockStatus({ plan: "pro", currency: "USD", suggestedCurrency: "USD", canManage: true, billingEnabled: true });
    render(<UpgradeDialog open onOpenChange={() => undefined} limit="products" reason="Your plan includes 3 products." />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Your plan includes 3 products.")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Upgrade to Team" })).toBeInTheDocument());
    expect(within(dialog).getByRole("rowheader", { name: "Products" })).toBeInTheDocument();
    expect(within(dialog).getByText("$59 / month")).toBeInTheDocument();
  });

  it("says when the workspace is already on the largest plan", async () => {
    mockStatus({ plan: "team", currency: "USD", canManage: true, billingEnabled: true });
    render(<UpgradeDialog open onOpenChange={() => undefined} limit="products" requiredPlan="team" />);
    await waitFor(() => expect(screen.getByText("You have reached your plan's limit")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Open billing" })).toHaveAttribute("href", "/billing");
  });

  it("opens from the hook", async () => {
    function Harness() {
      const { open, dialog } = useUpgradeDialog();
      return (
        <>
          <button type="button" onClick={() => open({ feature: "team_members" })}>
            Make admin
          </button>
          {dialog}
        </>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Upgrade to Team" })).toBeInTheDocument();
  });
});

describe("BillingView", () => {
  const usage: BillingUsage = {
    period: "2026-11",
    metrics: {
      feedback_items_per_month: { used: 120, max: 500 },
      manual_runs_per_month: { used: 1, max: 4 },
      prds_per_month: { used: 0, max: 3 },
      chat_messages_per_month: { used: 5, max: 20 },
      extension_clips_per_month: { used: 0, max: 100 },
    },
    counts: { products: { used: 1, max: 1 }, seats: { used: 1, max: 1 } },
  };
  const free: BillingState = {
    plan: "free",
    storedPlan: "free",
    status: "none",
    trialEndsAt: null,
    interval: null,
    currency: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isPaid: false,
  };

  it("shows plans read-only when payments are not configured", () => {
    render(
      <BillingView
        workspaceName="Acme"
        state={free}
        usage={usage}
        billingEnabled={false}
        canManage
        suggestedCurrency="INR"
        preselect={{ plan: null, interval: null, currency: null }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText("Payments are not set up on this deployment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    expect(screen.getByText("Usage in November 2026")).toBeInTheDocument();
  });

  it("lets a paid owner cancel and marks the current plan", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <BillingView
        workspaceName="Acme"
        state={{
          ...free,
          plan: "pro",
          storedPlan: "pro",
          status: "active",
          interval: "month",
          currency: "USD",
          currentPeriodEnd: "2026-12-12T00:00:00.000Z",
          isPaid: true,
        }}
        usage={usage}
        billingEnabled
        canManage
        suggestedCurrency="USD"
        preselect={{ plan: "team", interval: null, currency: null }}
      />,
    );
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to Team" })).toBeEnabled();
    expect(screen.getByText("Renews on 12 Dec 2026.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("You keep Pro until 12 Dec 2026");
  });

  it("is read-only for members", () => {
    render(
      <BillingView
        workspaceName="Acme"
        state={free}
        usage={usage}
        billingEnabled
        canManage={false}
        suggestedCurrency="USD"
        preselect={{ plan: null, interval: null, currency: null }}
      />,
    );
    expect(screen.getByRole("button", { name: "Upgrade to Team" })).toBeDisabled();
    expect(screen.getByText("Only workspace owners and admins can change the plan.")).toBeInTheDocument();
  });
});
