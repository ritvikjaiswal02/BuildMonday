import { describe, expect, it } from "vitest";
import {
  allowedOriginsSchema,
  createProductSchema,
  mergeWidgetSettings,
  normalizeOrigin,
  normalizeWebsiteUrl,
  productPatchSchema,
  widgetSettingsPatchSchema,
} from "@/app/api/products/_lib/rules";
import {
  githubSchema,
  linearSchema,
  looksLikeSlackWebhook,
  normalizeChannelName,
  normalizeLabels,
  parseRepoInput,
  slackSchema,
} from "@/app/api/integrations/_lib/rules";
import { createSourceSchema, sourceLocatorSchema, updateSourceSchema } from "@/app/api/sources/_lib/schemas";
import { onboardingSchema } from "@/app/api/onboarding/_lib/schema";
import { DEFAULT_WIDGET_SETTINGS } from "@/lib/db/schema";

describe("product rules", () => {
  it("normalises websites", () => {
    expect(normalizeWebsiteUrl("acme.com")).toBe("https://acme.com");
    expect(normalizeWebsiteUrl(" http://acme.com ")).toBe("http://acme.com");
    expect(normalizeWebsiteUrl("")).toBeNull();
    expect(normalizeWebsiteUrl(null)).toBeNull();
  });

  it("validates product create bodies", () => {
    expect(createProductSchema.parse({ name: "  Acme   Notes ", websiteUrl: "acme.com" })).toEqual({
      name: "Acme Notes",
      websiteUrl: "https://acme.com",
    });
    expect(createProductSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "Acme", websiteUrl: "not a url" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "Acme", description: "x".repeat(281) }).success).toBe(false);
  });

  it("normalises allowed origins", () => {
    expect(normalizeOrigin("https://Acme.com/pricing?x=1")).toBe("https://acme.com");
    expect(normalizeOrigin("acme.com")).toBe("https://acme.com");
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeOrigin("ftp://acme.com")).toBeNull();
    expect(normalizeOrigin("intranet")).toBeNull();
    expect(allowedOriginsSchema.parse(["acme.com", "https://acme.com/", " ", "https://app.acme.com"])).toEqual([
      "https://acme.com",
      "https://app.acme.com",
    ]);
    expect(allowedOriginsSchema.safeParse(["nope nope"]).success).toBe(false);
    expect(allowedOriginsSchema.safeParse(Array.from({ length: 11 }, (_, i) => `s${i}.com`)).success).toBe(false);
  });

  it("validates and merges widget settings", () => {
    const patch = widgetSettingsPatchSchema.parse({ accent: "#2340D9", buttonLabel: " Ideas " });
    expect(patch).toEqual({ accent: "#2340d9", buttonLabel: "Ideas" });
    expect(mergeWidgetSettings(DEFAULT_WIDGET_SETTINGS, patch)).toEqual({
      ...DEFAULT_WIDGET_SETTINGS,
      accent: "#2340d9",
      buttonLabel: "Ideas",
    });
    expect(widgetSettingsPatchSchema.parse({ accent: "" })).toEqual({ accent: null });
    expect(widgetSettingsPatchSchema.safeParse({ accent: "blue" }).success).toBe(false);
    expect(widgetSettingsPatchSchema.safeParse({ position: "top" }).success).toBe(false);
    expect(widgetSettingsPatchSchema.safeParse({ unknown: true }).success).toBe(false);
  });

  it("validates product patches", () => {
    expect(productPatchSchema.parse({ alertThreshold: 75, autofileTarget: null })).toEqual({
      alertThreshold: 75,
      autofileTarget: null,
    });
    expect(productPatchSchema.safeParse({}).success).toBe(false);
    expect(productPatchSchema.safeParse({ autofileThreshold: 40 }).success).toBe(false);
    expect(productPatchSchema.safeParse({ alertThreshold: 101 }).success).toBe(false);
    expect(productPatchSchema.safeParse({ publicKey: "pk_x" }).success).toBe(false);
  });
});

describe("integration rules", () => {
  it("parses repositories", () => {
    expect(parseRepoInput("acme/notes")).toEqual({ owner: "acme", repo: "notes" });
    expect(parseRepoInput("https://github.com/acme/notes.git")).toEqual({ owner: "acme", repo: "notes" });
    expect(parseRepoInput("github.com/acme/notes/issues")).toEqual({ owner: "acme", repo: "notes" });
    expect(parseRepoInput("acme")).toBeNull();
  });

  it("normalises labels and channel names", () => {
    expect(normalizeLabels("bug, from-users , Bug,,")).toEqual(["bug", "from-users"]);
    expect(normalizeLabels(["a", "b", "c", "d", "e", "f"])).toHaveLength(5);
    expect(normalizeChannelName("#Product Feedback")).toBe("product-feedback");
    expect(normalizeChannelName("")).toBeNull();
  });

  it("recognises Slack webhook URLs", () => {
    expect(looksLikeSlackWebhook("https://hooks.slack.com/services/T000/B000/abcDEF123")).toBe(true);
    expect(looksLikeSlackWebhook("http://hooks.slack.com/services/T000/B000/abc")).toBe(false);
    expect(looksLikeSlackWebhook("https://example.com/services/T/B/x")).toBe(false);
  });

  it("validates request bodies", () => {
    expect(slackSchema.parse({ webhookUrl: " https://hooks.slack.com/services/T/B/x ", channelName: "#alerts" })).toEqual({
      webhookUrl: "https://hooks.slack.com/services/T/B/x",
      channelName: "alerts",
    });
    expect(linearSchema.safeParse({ apiKey: "short", teamId: "t" }).success).toBe(false);
    expect(linearSchema.parse({ apiKey: "lin_api_1234567890", teamId: "team-1" }).labelName).toBeNull();
    expect(githubSchema.parse({ token: "github_pat_123456", repo: "acme/notes", labels: ["bug", "bug"] }).labels).toEqual([
      "bug",
    ]);
    expect(githubSchema.parse({ token: "github_pat_123456", repo: "acme/notes" }).labels).toEqual([]);
  });
});

describe("source request schemas", () => {
  it("accepts either kind + config or a url", () => {
    expect(sourceLocatorSchema.safeParse({ kind: "trustpilot", config: { domain: "acme.com" } }).success).toBe(true);
    expect(sourceLocatorSchema.safeParse({ url: "https://acme.com" }).success).toBe(true);
    expect(sourceLocatorSchema.safeParse({ kind: "myspace", config: {} }).success).toBe(false);
    expect(sourceLocatorSchema.safeParse({ url: "" }).success).toBe(false);
  });

  it("validates create and update bodies", () => {
    expect(
      createSourceSchema.parse({ productId: "p1", url: "https://x.com", role: "competitor", competitorName: "  Big  Rival " }),
    ).toEqual({ productId: "p1", url: "https://x.com", role: "competitor", competitorName: "Big Rival" });
    expect(updateSourceSchema.safeParse({}).success).toBe(false);
    expect(updateSourceSchema.parse({ label: "  My  label " })).toEqual({ label: "My label" });
  });
});

describe("onboarding schema", () => {
  const body = {
    product: { name: "Acme", websiteUrl: "acme.com" },
    team: { role: "founder", size: "2-5", tracker: "linear", usesSlack: true },
    notifications: { digest: true, alerts: "all", timezone: "Asia/Kolkata" },
  };

  it("defaults sources and normalises the website", () => {
    const parsed = onboardingSchema.parse(body);
    expect(parsed.sources).toEqual([]);
    expect(parsed.product.websiteUrl).toBe("https://acme.com");
  });

  it("falls back to UTC for unknown time zones", () => {
    expect(onboardingSchema.parse({ ...body, notifications: { ...body.notifications, timezone: "Nowhere/Land" } }).notifications.timezone).toBe(
      "UTC",
    );
  });

  it("defaults a source's role to own and rejects unknown answers", () => {
    const parsed = onboardingSchema.parse({ ...body, sources: [{ kind: "trustpilot", config: { domain: "acme.com" } }] });
    expect(parsed.sources[0].role).toBe("own");
    expect(onboardingSchema.safeParse({ ...body, team: { ...body.team, size: "huge" } }).success).toBe(false);
  });
});
