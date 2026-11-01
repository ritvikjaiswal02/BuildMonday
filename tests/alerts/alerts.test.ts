import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSlackAlert, buildSlackAutofiled, renderAlertEmail, selectAlertIssues, type AlertCandidate } from "@/lib/alerts/render";
import { isValidSlackWebhook, postSlackMessage, slackEscape } from "@/lib/alerts/slack";

const candidate = (over: Partial<AlertCandidate>): AlertCandidate => ({
  id: "i1",
  title: "Checkout fails",
  kind: "new_issue",
  priorityScore: 80,
  recommendedAction: "investigate",
  frequency: 6,
  previousFrequency: null,
  quote: "I could not pay",
  url: "https://app.example/issues/i1",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("selectAlertIssues", () => {
  const candidates = [
    candidate({ id: "serious-new", priorityScore: 75 }),
    candidate({ id: "fix-now-low", priorityScore: 30, recommendedAction: "fix_now" }),
    candidate({ id: "low-new", priorityScore: 20 }),
    candidate({ id: "worse-high", kind: "worsened", priorityScore: 90 }),
    candidate({ id: "worse-low", kind: "worsened", priorityScore: 40, recommendedAction: "fix_now" }),
    candidate({ id: "already", priorityScore: 99 }),
    candidate({ id: "cooldown", kind: "worsened", priorityScore: 99 }),
  ];

  it("applies thresholds, fix_now and dedupe", () => {
    const { serious, all } = selectAlertIssues({
      candidates,
      threshold: 70,
      alreadyAlertedNew: new Set(["already"]),
      recentlyAlertedWorsened: new Set(["cooldown"]),
    });
    expect(serious.map((c) => c.id)).toEqual(["worse-high", "serious-new", "fix-now-low"]);
    expect(all.map((c) => c.id).sort()).toEqual(["fix-now-low", "low-new", "serious-new", "worse-high", "worse-low"].sort());
  });
});

describe("alert email", () => {
  it("uses the single-issue subject", () => {
    const email = renderAlertEmail({
      productName: "Acme",
      issues: [candidate({})],
      dashboardUrl: "https://app.example/dashboard",
      settingsUrl: "https://app.example/settings/alerts",
    });
    expect(email.subject).toBe("New issue in Acme: Checkout fails");
    expect(email.text).toContain("6 reports, priority 80 of 100");
    expect(email.html).toContain("Open your list");
  });

  it("uses the many-issues subject and escapes HTML", () => {
    const email = renderAlertEmail({
      productName: "Acme",
      issues: [candidate({ title: "<script>x</script>" }), candidate({ id: "i2", kind: "worsened", previousFrequency: 2 })],
      dashboardUrl: "https://app.example/dashboard",
      settingsUrl: "https://app.example/settings/alerts",
    });
    expect(email.subject).toBe("2 issues need attention in Acme");
    expect(email.html).not.toContain("<script>x</script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("6 reports (was 2)");
  });

  it("names a single worsened issue", () => {
    const email = renderAlertEmail({
      productName: "Acme",
      issues: [candidate({ kind: "worsened" })],
      dashboardUrl: "d",
      settingsUrl: "s",
    });
    expect(email.subject).toBe("Getting worse in Acme: Checkout fails");
  });
});

describe("Slack", () => {
  it("validates incoming webhook URLs", () => {
    expect(isValidSlackWebhook("https://hooks.slack.com/services/T000/B000/abcDEF123")).toBe(true);
    expect(isValidSlackWebhook("http://hooks.slack.com/services/T000/B000/abc")).toBe(false);
    expect(isValidSlackWebhook("https://example.com/services/T/B/x")).toBe(false);
  });

  it("escapes mrkdwn control characters", () => {
    expect(slackEscape("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("caps the alert at five issues with a more line and a button", () => {
    const msg = buildSlackAlert({
      productName: "Acme",
      issues: Array.from({ length: 7 }, (_, i) => candidate({ id: `i${i}`, title: `Issue ${i}` })),
      dashboardUrl: "https://app.example/dashboard",
    });
    const blocks = msg.blocks as Array<{ type: string; text?: { text: string } }>;
    expect(blocks.filter((b) => b.type === "section")).toHaveLength(6);
    expect(JSON.stringify(blocks)).toContain("2 more in BuildMonday");
    expect(JSON.stringify(blocks)).toContain("View in BuildMonday");
    expect(msg.text).toMatch(/^7 issues need attention in Acme/);
  });

  it("lists auto-filed issues with links", () => {
    const msg = buildSlackAutofiled({
      productName: "Acme",
      filed: [{ title: "Crash", issueUrl: "https://app/i/1", externalUrl: "https://linear.app/x/1", target: "linear" }],
    });
    expect(JSON.stringify(msg.blocks)).toContain("<https://linear.app/x/1|Linear>");
  });

  it("posts and surfaces Slack's error text", async () => {
    const ok = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", ok);
    await postSlackMessage("https://hooks.slack.com/services/T0/B0/xyz", { text: "hi" });
    expect(ok).toHaveBeenCalledTimes(1);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid_payload", { status: 400 })));
    await expect(postSlackMessage("https://hooks.slack.com/services/T0/B0/xyz", { text: "hi" })).rejects.toMatchObject({
      status: 502,
      code: "upstream_failed",
      message: expect.stringContaining("invalid_payload"),
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no_service", { status: 404 })));
    await expect(postSlackMessage("https://hooks.slack.com/services/T0/B0/xyz", { text: "hi" })).rejects.toThrow(
      /Check the webhook is still active/,
    );
  });

  it("refuses non-Slack URLs without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postSlackMessage("https://evil.example/hook", { text: "x" })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
