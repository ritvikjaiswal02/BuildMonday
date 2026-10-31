// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FEATURE_KEYS, LIMIT_KEYS, PLANS } from "@/lib/plans";
import {
  comparisonGroups,
  planCtaHref,
  planCtaLabel,
  priceDisplay,
  yearlyMonthsFree,
} from "@/components/landing/pricing";
import { PlanColumns } from "@/components/landing/PlanColumns";
import { PricingTable } from "@/components/landing/PricingTable";
import { Faq } from "@/components/landing/Faq";
import { widgetSnippet } from "@/components/landing/CollectSection";
import { supportEmail } from "@/components/landing/LegalPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("planCtaHref", () => {
  it("sends signed-out visitors to login with the billing page as an encoded next", () => {
    const href = planCtaHref("pro", "year", false);
    expect(href).toBe("/login?next=%2Fbilling%3Fplan%3Dpro%26interval%3Dyear");
    const next = new URL(href, "http://x").searchParams.get("next");
    expect(next).toBe("/billing?plan=pro&interval=year");
  });

  it("sends signed-in users straight to billing", () => {
    expect(planCtaHref("team", "month", true)).toBe("/billing?plan=team&interval=month");
  });

  it("starts onboarding for Free, or opens the dashboard when signed in", () => {
    expect(planCtaHref("free", "month", false)).toBe("/login?next=/onboarding");
    expect(planCtaHref("free", "year", true)).toBe("/dashboard");
  });

  it("labels buttons with verbs", () => {
    expect(planCtaLabel("free", false)).toBe("Start free");
    expect(planCtaLabel("pro", false)).toBe("Choose Pro");
    expect(planCtaLabel("team", true)).toBe("Upgrade to Team");
  });
});

describe("priceDisplay", () => {
  it("formats monthly prices with the yearly alternative", () => {
    expect(priceDisplay(PLANS.pro, "INR", "month")).toEqual({
      amount: "₹1,499",
      suffix: "/ month",
      note: "Billed monthly, or ₹14,990 a year.",
    });
    expect(priceDisplay(PLANS.team, "USD", "month").amount).toBe("$59");
  });

  it("formats yearly prices with a per-month equivalent", () => {
    const p = priceDisplay(PLANS.pro, "USD", "year");
    expect(p.amount).toBe("$190");
    expect(p.suffix).toBe("/ year");
    expect(p.note).toBe("Billed yearly, about $16 a month.");
  });

  it("shows Free without a suffix", () => {
    const p = priceDisplay(PLANS.free, "INR", "year");
    expect(p.amount).toBe("₹0");
    expect(p.suffix).toBe("");
  });

  it("matches the two-months-free promise", () => {
    expect(yearlyMonthsFree(PLANS.pro, "INR")).toBe(2);
    expect(yearlyMonthsFree(PLANS.team, "USD")).toBe(2);
    expect(yearlyMonthsFree(PLANS.free, "USD")).toBe(0);
  });
});

describe("comparisonGroups", () => {
  it("covers every limit and feature exactly once", () => {
    const keys = comparisonGroups().flatMap((g) => g.rows.map((r) => r.key));
    const expected = [...LIMIT_KEYS, ...FEATURE_KEYS.filter((k) => k !== "daily_runs"), "cadence"];
    expect([...keys].sort()).toEqual([...expected].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("describes check frequency and history in words", () => {
    const rows = comparisonGroups().flatMap((g) => g.rows);
    const cadence = rows.find((r) => r.key === "cadence")!;
    expect(cadence.values.free).toEqual({ kind: "text", text: "Weekly, on Sunday" });
    expect(cadence.values.pro).toEqual({ kind: "text", text: "Every day" });
    const history = rows.find((r) => r.key === "history_days")!;
    expect(history.values.pro).toEqual({ kind: "text", text: "1 year" });
    expect(history.values.team).toEqual({ kind: "text", text: "2 years" });
    const prds = rows.find((r) => r.key === "prds_per_month")!;
    expect(prds.values.pro).toEqual({ kind: "text", text: "Unlimited" });
  });
});

describe("PlanColumns", () => {
  it("renders three plans with prices in the chosen currency and working links", () => {
    render(<PlanColumns currency="USD" interval="month" signedIn={false} />);
    for (const name of ["Free", "Pro", "Team"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("$19")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose Pro" })).toHaveAttribute(
      "href",
      "/login?next=%2Fbilling%3Fplan%3Dpro%26interval%3Dmonth",
    );
    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/login?next=/onboarding");
  });
});

describe("PricingTable", () => {
  it("switches interval and currency", () => {
    render(<PricingTable initialCurrency="INR" signedIn />);
    expect(screen.getAllByText("₹1,499").length).toBeGreaterThan(0);

    const interval = screen.getByRole("radiogroup", { name: "Billing interval" });
    fireEvent.click(within(interval).getByRole("radio", { name: "Yearly" }));
    expect(screen.getAllByText("₹14,990").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute(
      "href",
      "/billing?plan=pro&interval=year",
    );

    const currency = screen.getByRole("radiogroup", { name: "Currency" });
    fireEvent.click(within(currency).getByRole("radio", { name: "USD" }));
    expect(screen.getAllByText("$190").length).toBeGreaterThan(0);
    expect(document.cookie).toContain("bm-currency=USD");
  });

  it("marks included and missing features for screen readers", () => {
    render(<PricingTable initialCurrency="USD" signedIn={false} />);
    expect(screen.getAllByText("Included").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not included").length).toBeGreaterThan(0);
  });
});

describe("Faq", () => {
  it("renders each question as a summary of a details element", () => {
    render(<Faq items={[{ question: "Can I cancel?", answer: <p>Yes.</p> }]} />);
    const summary = screen.getByText("Can I cancel?").closest("summary");
    expect(summary?.parentElement?.tagName).toBe("DETAILS");
  });
});

describe("helpers", () => {
  it("builds the widget snippet against the app URL", () => {
    expect(widgetSnippet("https://buildmonday.app/")).toBe(
      ['<script', '  src="https://buildmonday.app/widget.js"', '  data-key="pk_your_public_key"', "  async", "></script>"].join("\n"),
    );
  });

  it("derives the support address from the app URL", () => {
    expect(supportEmail("https://www.example.com")).toBe("support@example.com");
    expect(supportEmail("not a url")).toBe("support@buildmonday.app");
  });
});
