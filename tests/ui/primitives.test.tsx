// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { PriorityMeter, ProgressBar } from "@/components/ui/meter";
import { EmptyState } from "@/components/ui/empty-state";
import { Callout } from "@/components/ui/callout";
import { Stat, StatGroup } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SourceGlyph } from "@/components/brand/logos";
import { Wordmark } from "@/components/brand/logo";

afterEach(() => cleanup());

describe("Button", () => {
  it("defaults to type=button and the secondary variant", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("border-line-strong");
  });

  it("disables and marks busy while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Run now
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Run now" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders its child with asChild", () => {
    render(
      <Button asChild variant="primary">
        <a href="/login">Start free</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Start free" });
    expect(link).toHaveAttribute("href", "/login");
    expect(link.className).toContain("bg-brand");
  });
});

describe("Field", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field label="Product name" htmlFor="name" hint="Shown in emails." error="Enter a name.">
        <Input id="name" />
      </Field>,
    );
    const input = screen.getByLabelText("Product name");
    expect(input).toHaveAttribute("aria-describedby", "name-hint name-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a name.").closest("p")).toHaveAttribute("id", "name-error");
  });

  it("shows Optional on optional fields", () => {
    render(
      <Field label="Website" htmlFor="site" optional>
        <Input id="site" />
      </Field>,
    );
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  function Harness() {
    const [value, setValue] = React.useState<"month" | "year">("month");
    return (
      <SegmentedControl
        aria-label="Billing interval"
        value={value}
        onChange={setValue}
        options={[
          { value: "month", label: "Monthly" },
          { value: "year", label: "Yearly" },
        ]}
      />
    );
  }

  it("is a radiogroup with roving focus and arrow-key selection", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Billing interval" });
    expect(group).toBeInTheDocument();
    const monthly = screen.getByRole("radio", { name: "Monthly" });
    const yearly = screen.getByRole("radio", { name: "Yearly" });
    expect(monthly).toHaveAttribute("aria-checked", "true");
    expect(monthly).toHaveAttribute("tabindex", "0");
    expect(yearly).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(monthly, { key: "ArrowRight" });
    expect(yearly).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(yearly);

    fireEvent.keyDown(yearly, { key: "ArrowRight" });
    expect(monthly).toHaveAttribute("aria-checked", "true");
  });
});

describe("meters", () => {
  it("labels the priority meter with the score", () => {
    render(<PriorityMeter score={82} />);
    expect(screen.getByRole("img", { name: "Priority 82 of 100" })).toBeInTheDocument();
  });

  it("exposes progress values", () => {
    render(<ProgressBar value={412} max={500} label="Feedback items" />);
    const bar = screen.getByRole("progressbar", { name: "Feedback items" });
    expect(bar).toHaveAttribute("aria-valuenow", "412");
    expect(bar).toHaveAttribute("aria-valuemax", "500");
  });
});

describe("states and layout", () => {
  it("renders an empty state with its action", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No feedback yet"
        description="Add a source, install the widget, or paste feedback to get started."
        action={<Button variant="primary">Add feedback</Button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No feedback yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add feedback" })).toBeInTheDocument();
  });

  it("announces danger callouts only", () => {
    const { rerender } = render(<Callout tone="danger" title="Run failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Run failed");
    rerender(<Callout tone="brand" title="Watch this every day" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders stats with a readable delta", () => {
    render(
      <StatGroup>
        <Stat label="Feedback this week" value="128" delta={{ value: "12%", direction: "up", tone: "bad" }} />
        <Stat label="Open issues" value="9" />
      </StatGroup>,
    );
    expect(screen.getByText("Feedback this week")).toBeInTheDocument();
    expect(screen.getByText("Up")).toHaveClass("sr-only");
  });

  it("renders the page h1 and breadcrumb", () => {
    render(
      <PageHeader
        title="Checkout fails on Android"
        breadcrumb={[{ label: "Issues", href: "/issues" }, { label: "Checkout fails on Android" }]}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Checkout fails on Android" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Issues" })).toHaveAttribute("href", "/issues");
  });

  it("renders badge text with a dot", () => {
    render(
      <Badge tone="danger" dot>
        Fix now
      </Badge>,
    );
    expect(screen.getByText("Fix now")).toBeInTheDocument();
  });
});

describe("brand", () => {
  it("renders the wordmark text", () => {
    render(<Wordmark />);
    expect(screen.getByText("BuildMonday")).toBeInTheDocument();
  });

  it("maps source kinds to glyphs with accessible titles", () => {
    render(
      <div>
        <SourceGlyph kind="hn" title="Hacker News" />
        <SourceGlyph kind="widget" title="Website widget" />
        <SourceGlyph kind="something-new" title="Other" />
      </div>,
    );
    expect(screen.getByRole("img", { name: "Hacker News" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Website widget" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Other" })).toBeInTheDocument();
  });
});
