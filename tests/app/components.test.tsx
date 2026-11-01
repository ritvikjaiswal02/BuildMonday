// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => cleanup());
import { StageList } from "@/components/app/StageList";
import { SummaryBar } from "@/components/SummaryBar";
import { TrendBadge, RunStatusBadge } from "@/components/Badges";
import { SourceMixBar } from "@/components/app/SourceMixBar";
import { TrendHistoryChart } from "@/components/app/TrendHistoryChart";
import { QuotaBanner } from "@/components/app/QuotaBanner";
import type { Issue } from "@/lib/types";

const issues: Issue[] = [
  {
    title: "Checkout fails",
    frequency: 6,
    severity: "High",
    churn_risk: "High",
    effort: "M",
    affected_segment: "Buyers",
    evidence: ["fails"],
    recommended_action: "fix_now",
    priority_score: 90,
  },
  {
    title: "Search slow",
    frequency: 3,
    severity: "Low",
    churn_risk: "Low",
    effort: "S",
    affected_segment: "All",
    evidence: ["slow"],
    recommended_action: "monitor",
    priority_score: 30,
  },
];

describe("StageList", () => {
  it("announces each step's state in words", () => {
    render(
      <StageList
        steps={[
          { label: "Fetching sources", state: "done" },
          { label: "Saving new feedback", state: "active", hint: "Skipping duplicates." },
          { label: "Grouping into issues", state: "pending" },
        ]}
      />,
    );
    expect(screen.getByText(/Fetching sources/)).toHaveTextContent("Fetching sources, done");
    expect(screen.getByText(/Saving new feedback/)).toHaveTextContent("in progress");
    expect(screen.getByText("Skipping duplicates.")).toBeInTheDocument();
  });
});

describe("SummaryBar", () => {
  it("shows totals and the change since the last analysis", () => {
    render(
      <SummaryBar
        issues={issues}
        diff={{
          perIssue: [{ category: "new" }, { category: "worsened", priorFrequency: 1 }],
          resolved: [{ priorIdx: 0, title: "Old", frequency: 2 }],
          priorRunDate: new Date(Date.now() - 2 * 3600_000).toISOString(),
        }}
      />,
    );
    expect(screen.getByText("Complaints grouped")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText(/Compared with your analysis 2 h ago/)).toBeInTheDocument();
    expect(screen.getByText("Getting worse")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });
});

describe("badges", () => {
  it("always carry a word", () => {
    const { rerender } = render(<TrendBadge trend="worsened" delta={4} />);
    expect(screen.getByText("Getting worse")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    rerender(<TrendBadge trend="persistent" hidePersistent />);
    expect(screen.queryByText("Ongoing")).toBeNull();
    rerender(<RunStatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("issue page visuals", () => {
  it("renders a source mix legend with shares", () => {
    render(<SourceMixBar mix={{ appstore: 3, reddit: 1 }} />);
    expect(screen.getByText("App Store")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders the trend chart with an accessible table", () => {
    render(
      <TrendHistoryChart
        snapshots={[
          { runId: "r1", createdAt: "2026-10-01T05:00:00Z", frequency: 2, priorityScore: 40, rank: 3, trend: "new" },
          { runId: "r2", createdAt: "2026-10-02T05:00:00Z", frequency: 6, priorityScore: 70, rank: 1, trend: "worsened" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Reports per run, 2 runs" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("6");
  });

  it("explains the empty chart", () => {
    render(<TrendHistoryChart snapshots={[]} />);
    expect(screen.getByText(/appears after the first run/)).toBeInTheDocument();
  });
});

describe("QuotaBanner", () => {
  it("stays hidden below 90% and warns or blocks above", () => {
    const { container, rerender } = render(<QuotaBanner used={100} max={500} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<QuotaBanner used={460} max={500} />);
    expect(screen.getByText("Close to this month's feedback limit")).toBeInTheDocument();
    rerender(<QuotaBanner used={500} max={500} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Monthly feedback limit reached");
    rerender(<QuotaBanner used={9999} max={-1} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
