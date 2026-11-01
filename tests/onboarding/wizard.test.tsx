// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/components/billing", () => ({
  useUpgradeDialog: () => ({ open: vi.fn(), dialog: null }),
  PaywallGate: ({ description }: { description?: string }) => <p>{description}</p>,
}));

// Radix Switch measures itself; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

const { OnboardingWizard } = await import("@/components/onboarding/OnboardingWizard");

function continueButton() {
  return screen.getByRole("button", { name: /^(Continue|Continue without sources|Start monitoring)$/ });
}

beforeEach(() => {
  push.mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.scrollTo = vi.fn() as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OnboardingWizard", () => {
  it("validates the product step before moving on", async () => {
    render(<OnboardingWizard mode="first" plan="free" prefill={null} initialAnswers={null} suggestSources={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "What are you building?" })).toBeInTheDocument();
    fireEvent.click(continueButton());
    expect(await screen.findByText("Enter your product's name.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Acme Notes" } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole("heading", { level: 1, name: "Where do your customers talk about you?" })).toBeInTheDocument();
    // Keywords start with the product name, so Hacker News is searched and the step is not empty.
    expect(screen.getByLabelText("Words people use when they mention you")).toHaveValue("acme notes");
  });

  it("is three steps on Free and submits everything once at the end", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ productId: "p1", sources: [], skipped: [] }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingWizard mode="first" plan="free" prefill={null} initialAnswers={null} suggestSources={false} />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Acme Notes" } });
    fireEvent.click(continueButton());

    await screen.findByRole("heading", { level: 1, name: "Where do your customers talk about you?" });
    // Suggests r/<product> from the name.
    fireEvent.click(screen.getByRole("button", { name: "Add r/acmenotes" }));
    expect(screen.getByLabelText("Subreddits")).toHaveValue("r/acmenotes");
    fireEvent.change(screen.getByLabelText("Subreddits"), { target: { value: "r/acme, r/notes, r/apps" } });
    fireEvent.change(screen.getByLabelText("Trustpilot page"), { target: { value: "acme.com" } });
    expect(
      screen.getByText("The free plan watches 3 sources. Extra sources are saved but paused until you upgrade."),
    ).toBeInTheDocument();
    expect(screen.getByText("Watching competitors is on Pro and Team.")).toBeInTheDocument();
    fireEvent.click(continueButton());

    await screen.findByRole("heading", { level: 1, name: "Who should hear about it?" });
    expect(screen.getByText("Instant alerts are on Pro and Team. On Free, everything arrives in the Monday email.")).toBeInTheDocument();
    expect(screen.getByText(/Every Monday at 03:30 UTC \(9:00 in India\)/)).toBeInTheDocument();
    expect(screen.getByText(/Both are under Extension and widget in the sidebar after setup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }));
    expect(screen.getByText(/We do not file to Jira yet/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?first=1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/onboarding");
    const body = JSON.parse(String(init.body));
    expect(body.product.name).toBe("Acme Notes");
    expect(body.sources.map((s: { kind: string }) => s.kind)).toEqual([
      "reddit",
      "reddit",
      "reddit",
      "hackernews",
      "trustpilot",
    ]);
    expect(body.team).toEqual({ tracker: "jira", usesSlack: false });
    expect(body.notifications.alerts).toBe("off");
  });

  it("continues to the plan picked before signing up and brings the analyzed feedback along", async () => {
    window.localStorage.setItem(
      "bm-carry-feedback",
      JSON.stringify({ items: ["Sync loses my notes", "Export cuts off pages"], savedAt: Date.now() }),
    );
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/feedback"
        ? new Response(JSON.stringify({ inserted: 2 }), { status: 201 })
        : new Response(JSON.stringify({ productId: "p1", sources: [], skipped: [] }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OnboardingWizard
        mode="first"
        plan="pro"
        prefill={null}
        initialAnswers={null}
        suggestSources={false}
        afterSetupHref="/dashboard?first=1&upgrade=pro&interval=year"
      />,
    );
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Acme Notes" } });
    fireEvent.click(continueButton());
    await screen.findByRole("heading", { level: 1, name: "Where do your customers talk about you?" });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByRole("heading", { level: 1, name: "Who do you compete with?" });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByRole("heading", { level: 1, name: "Who should hear about it?" });
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?first=1&upgrade=pro&interval=year"));
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map((c) => c[0])).toEqual(["/api/onboarding", "/api/feedback"]);
    expect(JSON.parse(String(calls[1][1].body))).toEqual({
      productId: "p1",
      items: [{ text: "Sync loses my notes" }, { text: "Export cuts off pages" }],
    });
    expect(window.localStorage.getItem("bm-carry-feedback")).toBeNull();
  });

  it("keeps answers and shows the API error when setup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Database is not configured", code: "not_configured" }), { status: 503 })),
    );
    render(<OnboardingWizard mode="new" plan="pro" prefill={null} initialAnswers={null} suggestSources={false} />);
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Second app" } });
    fireEvent.click(continueButton());
    await screen.findByRole("heading", { level: 1, name: "Where do your customers talk about you?" });
    fireEvent.click(continueButton());
    await screen.findByRole("heading", { level: 1, name: "Who do you compete with?" });
    fireEvent.click(screen.getByRole("button", { name: "Add product and start monitoring" }));
    expect(await screen.findByText("Database is not configured")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
