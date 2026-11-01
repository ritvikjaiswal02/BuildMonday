// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { Landing } from "@/components/Landing";
import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// jsdom has no matchMedia; the theme toggle and framer-motion read it.
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => cleanup());

describe("Landing", () => {
  it("renders the hero copy and both calls to action", () => {
    render(<Landing currency="INR" signedIn={false} appUrl="https://buildmonday.app" />);
    expect(screen.getByRole("heading", { level: 1, name: "Know what to build on Monday." })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: "Start free" })[0]).toHaveAttribute(
      "href",
      "/login?next=/onboarding",
    );
    expect(within(main).getByRole("link", { name: "Try it without an account" })).toHaveAttribute("href", "/app");
    expect(screen.getAllByText("Includes 14 days of Pro. No card needed.").length).toBeGreaterThan(0);
  });

  it("labels every illustration as an example", () => {
    render(<Landing currency="USD" signedIn={false} appUrl="https://buildmonday.app" />);
    // Hero list plus the three automation excerpts.
    expect(screen.getAllByText("Example").length).toBeGreaterThanOrEqual(4);
  });

  it("sorts the hero list into rank order once", async () => {
    vi.useFakeTimers();
    try {
      render(<Landing currency="USD" signedIn={false} appUrl="https://buildmonday.app" />);
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      const list = screen.getByRole("list", { name: "Example ranked issues" });
      const ranks = within(list)
        .getAllByLabelText(/^Rank \d$/)
        .map((el) => el.getAttribute("aria-label"));
      expect(ranks).toEqual(["Rank 1", "Rank 2", "Rank 3", "Rank 4", "Rank 5"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the dashboard link to signed-in visitors", () => {
    render(<Landing currency="USD" signedIn appUrl="https://buildmonday.app" />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(within(header).queryByRole("link", { name: "Start free" })).toBeNull();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute(
      "href",
      "/billing?plan=pro&interval=month",
    );
  });

  it("prices the summary in the detected currency", () => {
    render(<Landing currency="INR" signedIn={false} appUrl="https://buildmonday.app" />);
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    expect(screen.getByText("₹4,999")).toBeInTheDocument();
  });

  it("shows the real widget snippet", () => {
    render(<Landing currency="USD" signedIn={false} appUrl="https://buildmonday.app" />);
    expect(
      screen.getByDisplayValue(
        ['<script', '  src="https://buildmonday.app/widget.js"', '  data-key="pk_your_public_key"', "  async", "></script>"].join("\n"),
        { normalizer: (s) => s },
      ),
    ).toBeInTheDocument();
  });
});

describe("legal pages", () => {
  it("renders the privacy policy with processors and retention", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    for (const name of ["Vercel", "Google Gemini", "Resend", "Razorpay"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/AES-256-GCM/)).toBeInTheDocument();
    expect(screen.getByText("Free: 30 days")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^support@/ }).length).toBeGreaterThan(0);
  });

  it("renders the terms", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Plans and billing" })).toBeInTheDocument();
  });
});
