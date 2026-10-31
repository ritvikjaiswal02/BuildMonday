import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWeekDays, dayKey, lastDayKeys, safeTimeZone } from "@/components/app/week";
import { formatScheduleUtc, scheduleMeta, weekDelta } from "@/components/app/format";
import { quotaShare } from "@/components/app/QuotaBanner";
import { niceMax } from "@/components/app/TrendHistoryChart";
import { sourceHealth } from "@/components/app/SourceHealthList";
import { issueDtoToAnalysis, matchEvidenceSources, sourceMixEntries, sourceMixFromKinds } from "@/components/app/adapters";
import { isDefaultIssueFilters, parseIssueFilters } from "@/components/app/issue-filters";
import { apiFetch, ApiError, defaultMessageForStatus, errorMessage } from "@/components/app/api";
import { fileSlug } from "@/components/app/csv";
import type { IssueDTO } from "@/lib/db/dto";

describe("week buckets", () => {
  const now = new Date("2026-11-04T10:00:00Z"); // a Wednesday

  it("validates time zones", () => {
    expect(safeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(safeTimeZone("Mars/Base")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
  });

  it("keys days in the given zone", () => {
    expect(dayKey(new Date("2026-11-03T20:00:00Z"), "UTC")).toBe("2026-11-03");
    expect(dayKey(new Date("2026-11-03T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-04");
  });

  it("lists the last seven days ending today", () => {
    const keys = lastDayKeys(now, "UTC");
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-10-29");
    expect(keys[6]).toBe("2026-11-04");
  });

  it("builds week strip cells with weekday labels and counts", () => {
    const days = buildWeekDays(new Map([["2026-11-04", 5], ["2026-11-02", 2]]), now, "UTC");
    expect(days.map((d) => d.label)).toEqual(["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]);
    expect(days[6]).toEqual({ label: "Wed", value: 5, title: "Wed 4 Nov" });
    expect(days[4].value).toBe(2);
    expect(days[0].value).toBe(0);
  });
});

describe("schedule copy", () => {
  const now = new Date("2026-11-04T10:00:00Z");

  it("labels times in UTC", () => {
    expect(formatScheduleUtc("2026-11-08T05:00:00Z", now)).toBe("Sun 05:00 UTC");
    expect(formatScheduleUtc("2026-12-20T05:00:00Z", now)).toBe("20 Dec 05:00 UTC");
  });

  it("describes last and next runs", () => {
    expect(scheduleMeta({ lastRunAt: null, nextRunAt: "2026-11-05T05:00:00Z", monitoringEnabled: true }, now)).toEqual([
      "No runs yet",
      "Next run Thu 05:00 UTC",
    ]);
    expect(scheduleMeta({ lastRunAt: "2026-11-04T07:00:00Z", nextRunAt: null, monitoringEnabled: false }, now)).toEqual([
      "Last run 3 h ago",
      "Monitoring is paused",
    ]);
    expect(scheduleMeta({ lastRunAt: null, nextRunAt: "2026-11-04T09:00:00Z", monitoringEnabled: true }, now)[1]).toBe(
      "Next run is due now",
    );
  });

  it("describes the week-over-week change", () => {
    expect(weekDelta(0, 0)).toBeUndefined();
    expect(weekDelta(12, 12)).toMatchObject({ direction: "flat" });
    expect(weekDelta(15, 10)).toEqual({ value: "+5 vs last week", direction: "up", tone: "neutral" });
    expect(weekDelta(3, 10)).toMatchObject({ value: "-7 vs last week", direction: "down" });
  });
});

describe("small numeric helpers", () => {
  it("computes quota share, unlimited as zero", () => {
    expect(quotaShare(450, 500)).toBe(0.9);
    expect(quotaShare(10, -1)).toBe(0);
  });

  it("rounds chart maxima up to pleasant values", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(4)).toBe(4);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(13)).toBe(15);
    expect(niceMax(42)).toBe(50);
    expect(niceMax(101)).toBe(150);
  });

  it("slugs file names", () => {
    expect(fileSlug("Acme Notes (beta)!")).toBe("acme-notes-beta");
    expect(fileSlug("!!!")).toBe("product");
  });
});

describe("source health", () => {
  const base = { enabled: true, lastError: null, lastFetchedAt: "2026-11-01T00:00:00Z", lastSuccessAt: "2026-11-01T00:00:00Z" };
  it("classifies sources", () => {
    expect(sourceHealth(base)).toBe("healthy");
    expect(sourceHealth({ ...base, enabled: false })).toBe("paused");
    expect(sourceHealth({ ...base, lastFetchedAt: null, lastSuccessAt: null })).toBe("waiting");
    expect(sourceHealth({ ...base, lastError: "Blocked", lastFetchedAt: "2026-11-02T00:00:00Z" })).toBe("error");
    expect(sourceHealth({ ...base, lastError: "Old error", lastFetchedAt: "2026-10-01T00:00:00Z" })).toBe("healthy");
  });
});

describe("adapters", () => {
  const dto = {
    id: "i1",
    productId: "p1",
    scope: "own",
    competitorName: null,
    title: "Sync loses notes",
    rankingReason: "Data loss",
    category: "sync",
    severity: "High",
    churnRisk: "Medium",
    effort: "L",
    affectedSegment: "Students",
    recommendedAction: "fix_now",
    priorityScore: 88,
    frequency: 7,
    rank: 1,
    evidence: ["My notes vanished after syncing on my phone"],
    sourceMix: { hackernews: 2, import: 1, manual: 2, appstore: 2 },
    status: "backlog",
    trend: "new",
    prd: null,
    prdGeneratedAt: null,
    externalTarget: null,
    externalUrl: null,
    filedAt: null,
    firstSeenAt: "2026-11-01T00:00:00Z",
    lastSeenAt: "2026-11-01T00:00:00Z",
    resolvedAt: null,
    updatedAt: "2026-11-01T00:00:00Z",
  } satisfies IssueDTO;

  it("converts stored issues to the analyzer shape", () => {
    const issue = issueDtoToAnalysis(dto);
    expect(issue).toMatchObject({
      title: "Sync loses notes",
      churn_risk: "Medium",
      recommended_action: "fix_now",
      priority_score: 88,
      ranking_reason: "Data loss",
      source_mix: { hn: 2, manual: 3, appstore: 2 },
    });
    expect(sourceMixFromKinds(null)).toEqual({});
  });

  it("orders mix entries by count with shares", () => {
    expect(sourceMixEntries({ reddit: 1, appstore: 3, hn: 0 })).toEqual([
      { kind: "appstore", count: 3, share: 0.75 },
      { kind: "reddit", count: 1, share: 0.25 },
    ]);
  });

  it("matches evidence quotes to their feedback source", () => {
    expect(
      matchEvidenceSources(
        ["My notes vanished after syncing", "short", "Not in the feedback at all, nope"],
        [{ text: "Ugh. My notes VANISHED after syncing on my phone!!", sourceKind: "playstore" }],
      ),
    ).toEqual(["playstore", null, null]);
  });
});

describe("issue filters", () => {
  it("parses search params with defaults", () => {
    expect(parseIssueFilters({})).toEqual({ scope: "own", status: "open", trend: "all", sort: "priority", q: "" });
    expect(parseIssueFilters({ scope: "competitor", status: "shipped", trend: "worsened", sort: "recent", q: "pay" })).toEqual({
      scope: "competitor",
      status: "shipped",
      trend: "worsened",
      sort: "recent",
      q: "pay",
    });
    expect(parseIssueFilters({ status: "nope", trend: "up", sort: "x" })).toMatchObject({ status: "open", trend: "all", sort: "priority" });
    expect(isDefaultIssueFilters(parseIssueFilters({ scope: "competitor" }))).toBe(true);
  });
});

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("returns JSON and sends JSON bodies", async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiFetch("/api/x", { method: "POST", json: { a: 1 } })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("throws the server message and parses plan errors", async () => {
    vi.stubGlobal(
      "fetch",
      respond(402, { error: "Exports are on Pro and Team.", code: "plan_required", feature: "export", requiredPlan: "pro" }),
    );
    const err = await apiFetch("/api/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Exports are on Pro and Team.");
    expect((err as ApiError).plan).toMatchObject({ feature: "export", requiredPlan: "pro" });
  });

  it("falls back to a readable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    const err = await apiFetch("/api/x").catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(500);
    expect(errorMessage(err)).toBe(defaultMessageForStatus(500));

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const net = await apiFetch("/api/x").catch((e: unknown) => e);
    expect((net as ApiError).status).toBe(0);
    expect((net as ApiError).message).toMatch(/connection/);
  });
});
