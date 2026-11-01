import { describe, expect, it } from "vitest";
import {
  STEPS,
  buildCompetitorDrafts,
  buildOnboardingPayload,
  buildSourceDrafts,
  effectiveWatchHn,
  initialWizardState,
  isValidTimezone,
  normalizeWebsite,
  stepsFor,
  subredditSuggestion,
  parseCarriedFeedback,
  timezoneOptions,
  trustpilotSuggestion,
  validateProduct,
  type WizardState,
} from "@/components/onboarding/model";

function state(overrides: Partial<WizardState> = {}): WizardState {
  const base = initialWizardState({ timezone: "Asia/Kolkata" });
  return {
    ...base,
    ...overrides,
    product: { ...base.product, name: "Acme Notes", ...(overrides.product ?? {}) },
    sources: { ...base.sources, ...(overrides.sources ?? {}) },
  };
}

describe("steps", () => {
  it("has the setup steps with exact titles", () => {
    expect(STEPS.map((s) => s.title)).toEqual([
      "What are you building?",
      "Where do your customers talk about you?",
      "Who do you compete with?",
      "Who should hear about it?",
    ]);
    expect(STEPS.filter((s) => s.skippable).map((s) => s.id)).toEqual(["sources", "competitors", "notifications"]);
  });

  it("is three steps on Free: competitors only appear when the plan can track them", () => {
    expect(stepsFor("first", "free").map((s) => s.id)).toEqual(["product", "sources", "notifications"]);
    expect(stepsFor("first", "pro").map((s) => s.id)).toEqual(["product", "sources", "competitors", "notifications"]);
  });

  it("drops the workspace questions when adding another product", () => {
    expect(stepsFor("new", "pro").map((s) => s.id)).toEqual(["product", "sources", "competitors"]);
    expect(stepsFor("new", "free").map((s) => s.id)).toEqual(["product", "sources"]);
  });

  it("defaults alerts to off on Free and to serious issues on paid plans", () => {
    expect(initialWizardState({ plan: "free" }).notifications.alerts).toBe("off");
    expect(initialWizardState({ plan: "pro" }).notifications.alerts).toBe("serious");
  });
});

describe("validateProduct", () => {
  it("requires a name up to 60 characters", () => {
    expect(validateProduct({ name: " ", websiteUrl: "", description: "" }).name).toBeTruthy();
    expect(validateProduct({ name: "x".repeat(61), websiteUrl: "", description: "" }).name).toBeTruthy();
    expect(validateProduct({ name: "Acme", websiteUrl: "", description: "" })).toEqual({});
  });

  it("accepts websites without a scheme and rejects junk", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com");
    expect(validateProduct({ name: "Acme", websiteUrl: "acme.com", description: "" }).websiteUrl).toBeUndefined();
    expect(validateProduct({ name: "Acme", websiteUrl: "not a site", description: "" }).websiteUrl).toBeTruthy();
  });

  it("limits the description to 280 characters", () => {
    expect(validateProduct({ name: "Acme", websiteUrl: "", description: "x".repeat(281) }).description).toBeTruthy();
  });
});

describe("buildSourceDrafts", () => {
  it("returns nothing for an empty step", () => {
    const r = buildSourceDrafts(state());
    expect(r.drafts).toEqual([]);
    expect(r.errors).toEqual({});
    expect(r.watchHn).toBe(false);
  });

  it("builds one source per filled field and per subreddit", () => {
    const r = buildSourceDrafts(
      state({
        sources: {
          appStore: "https://apps.apple.com/in/app/acme/id123456789",
          appStoreCountry: "us",
          playStore: "com.acme.notes",
          subreddits: "r/acme, r/productivity",
          keywords: "acmenotes",
          watchHn: null,
          trustpilot: "acme.com",
        },
      }),
    );
    expect(r.errors).toEqual({});
    expect(r.drafts.map((d) => d.kind)).toEqual(["appstore", "playstore", "reddit", "reddit", "hackernews", "hackernews", "trustpilot"]);
    expect(r.drafts[0].config).toEqual({ appId: "123456789", country: "in" });
    expect(r.drafts[2].config).toEqual({ mode: "subreddit", subreddit: "acme", keywords: ["Acme Notes", "acmenotes"] });
    expect(r.drafts.every((d) => d.role === "own" && d.competitorName === null)).toBe(true);
  });

  it("turns Hacker News on by default only when there are keywords, and respects an explicit choice", () => {
    expect(effectiveWatchHn(state().sources)).toBe(false);
    expect(effectiveWatchHn(state({ sources: { ...state().sources, keywords: "acme" } }).sources)).toBe(true);
    expect(effectiveWatchHn(state({ sources: { ...state().sources, keywords: "acme", watchHn: false } }).sources)).toBe(false);
    const explicit = buildSourceDrafts(state({ sources: { ...state().sources, watchHn: true } }));
    expect(explicit.drafts).toEqual([
      expect.objectContaining({ kind: "hackernews", config: { mode: "search", query: "Acme Notes" } }),
    ]);
  });

  it("reports unparseable fields", () => {
    const r = buildSourceDrafts(
      state({ sources: { ...state().sources, appStore: "nope", playStore: "http://x", subreddits: "r/ok, ???", trustpilot: "x" } }),
    );
    expect(Object.keys(r.errors).sort()).toEqual(["appStore", "playStore", "subreddits", "trustpilot"]);
    expect(r.drafts).toEqual([]);
  });

  it("drops duplicate sources", () => {
    const r = buildSourceDrafts(state({ sources: { ...state().sources, subreddits: "r/acme reddit.com/r/acme" } }));
    expect(r.drafts.filter((d) => d.kind === "reddit")).toHaveLength(1);
  });
});

describe("buildCompetitorDrafts", () => {
  it("ignores empty rows and validates partial ones", () => {
    const r = buildCompetitorDrafts([
      { id: "a", name: "", input: "" },
      { id: "b", name: "Notion", input: "" },
      { id: "c", name: "", input: "com.notion.android" },
      { id: "d", name: "Bear", input: "https://www.reddit.com/r/bearapp" },
    ]);
    expect(r.drafts).toEqual([]);
    expect(r.errors.b?.input).toBeTruthy();
    expect(r.errors.c?.name).toBeTruthy();
    expect(r.errors.d?.input).toMatch(/App Store, Google Play or Trustpilot/);
  });

  it("detects App Store, Google Play and Trustpilot inputs", () => {
    const r = buildCompetitorDrafts([
      { id: "a", name: "Notion", input: "https://play.google.com/store/apps/details?id=notion.id" },
      { id: "b", name: "Evernote", input: "evernote.com" },
    ]);
    expect(r.errors).toEqual({});
    expect(r.drafts).toEqual([
      expect.objectContaining({ kind: "playstore", role: "competitor", competitorName: "Notion" }),
      expect.objectContaining({ kind: "trustpilot", role: "competitor", competitorName: "Evernote", config: { domain: "evernote.com" } }),
    ]);
  });
});

describe("buildOnboardingPayload", () => {
  it("produces the POST /api/onboarding body with defaults for skipped answers", () => {
    const s = state({
      product: { name: "  Acme Notes ", websiteUrl: "acme.com", description: "" },
      sources: { ...state().sources, trustpilot: "acme.com" },
      competitors: [{ id: "x", name: "Notion", input: "notion.so" }],
    });
    const body = buildOnboardingPayload(s, { includeCompetitors: true });
    expect(body.product).toEqual({ name: "Acme Notes", websiteUrl: "https://acme.com", description: null });
    expect(body.sources).toEqual([
      { kind: "trustpilot", config: { domain: "acme.com" }, role: "own", competitorName: null },
      { kind: "trustpilot", config: { domain: "notion.so" }, role: "competitor", competitorName: "Notion" },
    ]);
    expect(body.team).toEqual({ tracker: "other", usesSlack: false });
    expect(body.autofile).toBeUndefined();
    expect(body.notifications).toEqual({ digest: true, alerts: "off", timezone: "Asia/Kolkata" });
    expect(buildOnboardingPayload(s, { includeCompetitors: false }).sources).toHaveLength(1);
  });

  it("asks to auto-file above 80 when a Linear or GitHub tracker is chosen", () => {
    const s = state();
    const body = buildOnboardingPayload({ ...s, team: { tracker: "linear", usesSlack: true, autofile: true } }, { includeCompetitors: false });
    expect(body.team).toEqual({ tracker: "linear", usesSlack: true });
    expect(body.autofile).toEqual({ target: "linear", enabled: true, threshold: 80 });
  });

  it("suggests a subreddit from the product name", () => {
    expect(subredditSuggestion("Acme Notes")).toBe("acmenotes");
    expect(subredditSuggestion("X")).toBeNull();
  });

  it("reads carried-over feedback only while it is fresh", () => {
    const now = Date.now();
    const raw = JSON.stringify({ items: ["Sync is broken", " ", 4], savedAt: now - 1000 });
    expect(parseCarriedFeedback(raw, now)).toEqual(["Sync is broken"]);
    expect(parseCarriedFeedback(raw, now + 2 * 24 * 60 * 60 * 1000)).toEqual([]);
    expect(parseCarriedFeedback("not json", now)).toEqual([]);
  });

  it("prefills step 2 from a detected source", () => {
    const s = initialWizardState({ prefill: { kind: "appstore", input: "123456789", country: "in" } });
    expect(s.sources.appStore).toBe("123456789");
    expect(s.sources.appStoreCountry).toBe("in");
  });
});

describe("helpers", () => {
  it("suggests a Trustpilot domain from the website", () => {
    expect(trustpilotSuggestion("https://www.acme.com/about")).toBe("acme.com");
    expect(trustpilotSuggestion("")).toBeNull();
  });

  it("validates time zones and always lists the current one", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(timezoneOptions("Asia/Kolkata")).toContain("Asia/Kolkata");
    expect(timezoneOptions()[0]).toBe("UTC");
  });
});
