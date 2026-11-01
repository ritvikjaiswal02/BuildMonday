import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callGeminiJson = vi.fn();
const callGeminiChat = vi.fn();
vi.mock("@/lib/gemini", () => ({
  callGeminiJson: (...a: unknown[]) => callGeminiJson(...a),
  callGeminiChat: (...a: unknown[]) => callGeminiChat(...a),
}));
const embedBatch = vi.fn();
vi.mock("@/lib/embeddings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/embeddings")>("@/lib/embeddings");
  return { ...actual, embedBatch: (...a: unknown[]) => embedBatch(...a) };
});
vi.mock("@/lib/auth/session", () => ({
  getSessionContext: async () => null,
  requireUser: async () => {
    throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  },
  requireProduct: async () => null,
}));

import { __resetMemoryRateLimits } from "@/lib/auth/rate-limit";
import { POST as analyze } from "@/app/api/analyze/route";
import { POST as chat } from "@/app/api/chat/route";
import { GET as cronMonitor } from "@/app/api/cron/monitor/route";
import { POST as fetchReviews } from "@/app/api/fetch-reviews/route";
import { POST as prd } from "@/app/api/prd/route";

const ctx = { params: {} as Record<string, string> };

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
    body: JSON.stringify(body),
  });
}

const savedEnv = { ...process.env };

beforeEach(() => {
  __resetMemoryRateLimits();
  callGeminiJson.mockReset();
  callGeminiChat.mockReset();
  embedBatch.mockReset();
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
});

describe("POST /api/analyze", () => {
  it("analyzes pasted lines and returns ranked issues with member indices", async () => {
    callGeminiJson
      .mockResolvedValueOnce([
        { index: 1, category: "checkout", severity: "High", churn_signal: "High" },
        { index: 2, category: "checkout", severity: "High", churn_signal: "Low" },
      ])
      .mockResolvedValueOnce([{ title: "Checkout fails", member_indices: [1, 2], priority_score: 91 }]);

    const res = await analyze(req("https://app/api/analyze", { complaints: "Checkout fails\nCannot pay\n\n" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff).toBeNull();
    expect(body.issues[0]).toMatchObject({ title: "Checkout fails", frequency: 2, member_indices: [1, 2], source_mix: { manual: 2 } });
  });

  it("keeps tagged sources and maps unknown ones to manual", async () => {
    callGeminiJson.mockResolvedValueOnce([]).mockResolvedValueOnce([{ title: "X", member_indices: [1, 2] }]);
    const res = await analyze(
      req("https://app/api/analyze", {
        complaintsTagged: [
          { text: "From play", source: "playstore" },
          { text: "From somewhere", source: "myspace" },
        ],
      }),
      ctx,
    );
    const body = await res.json();
    expect(body.issues[0].source_mix).toEqual({ playstore: 1, manual: 1 });
  });

  it("computes a diff against prior issues", async () => {
    callGeminiJson.mockResolvedValueOnce([]).mockResolvedValueOnce([{ title: "Checkout fails", member_indices: [1], priority_score: 50 }]);
    embedBatch.mockResolvedValueOnce([
      [1, 0],
      [1, 0],
    ]);
    const res = await analyze(
      req("https://app/api/analyze", {
        complaints: "Checkout fails",
        priorIssues: [{ title: "Checkout fails", frequency: 3, evidence: [] }],
        priorRunDate: "2026-10-01T00:00:00Z",
      }),
      ctx,
    );
    const body = await res.json();
    expect(body.diff.perIssue[0]).toMatchObject({ category: "improved", priorFrequency: 3 });
  });

  it("rejects empty input and more than 300 items", async () => {
    const empty = await analyze(req("https://app/api/analyze", { complaints: "\n\n" }), ctx);
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toMatch(/No complaints/);

    const many = await analyze(req("https://app/api/analyze", { complaints: Array.from({ length: 301 }, (_, i) => `c${i}`).join("\n") }), ctx);
    expect(many.status).toBe(400);
    expect((await many.json()).error).toMatch(/up to 300/);
    expect(callGeminiJson).not.toHaveBeenCalled();
  });

  it("limits anonymous use to 10 analyses per IP per day", async () => {
    callGeminiJson.mockResolvedValue([]);
    for (let i = 0; i < 10; i++) {
      const ok = await analyze(req("https://app/api/analyze", { complaints: "one complaint" }), ctx);
      expect(ok.status).toBe(200);
    }
    const limited = await analyze(req("https://app/api/analyze", { complaints: "one complaint" }), ctx);
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body).toMatchObject({ code: "rate_limited", error: "You have used today's free analyses. Create a free account to keep going." });
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(limited.headers.get("retry-after")).toBeTruthy();

    const otherIp = await analyze(req("https://app/api/analyze", { complaints: "one complaint" }, { "x-forwarded-for": "198.51.100.8" }), ctx);
    expect(otherIp.status).toBe(200);
  });

  it("returns 503 when Gemini is not configured", async () => {
    const { HttpError } = await import("@/lib/auth/http");
    callGeminiJson.mockRejectedValueOnce(new HttpError(503, "not_configured", "Analysis is not set up on this deployment yet (GEMINI_API_KEY is missing)."));
    const res = await analyze(req("https://app/api/analyze", { complaints: "x y z" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/GEMINI_API_KEY/);
  });
});

describe("POST /api/fetch-reviews", () => {
  it("rejects links it cannot recognise", async () => {
    const res = await fetchReviews(req("https://app/api/fetch-reviews", { url: "https://example.com" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/could not recognise/);
  });

  it("returns review texts with source codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            hits: [{ objectID: "1", comment_text: "Acme lost my notes after the last update", _tags: ["comment"] }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const res = await fetchReviews(req("https://app/api/fetch-reviews", { url: "https://hn.algolia.com/?query=acme" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      reviews: ["Acme lost my notes after the last update"],
      totalFetched: 1,
      source: "hackernews",
      sourceCode: "hn",
    });
  });

  it("maps source failures to 502 source_unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const res = await fetchReviews(req("https://app/api/fetch-reviews", { url: "https://apps.apple.com/us/app/x/id123456789" }), ctx);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "source_unreachable", error: expect.stringMatching(/not found/) });
  });
});

describe("POST /api/prd", () => {
  it("returns a normalised PRD", async () => {
    callGeminiJson.mockResolvedValueOnce({ problem_statement: "P", estimated_complexity: "S" });
    const res = await prd(req("https://app/api/prd", { title: "Checkout fails", evidence: ["It fails"] }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).prd).toMatchObject({ problem_statement: "P", estimated_complexity: "S", acceptance_criteria: [] });
  });

  it("validates input", async () => {
    const res = await prd(req("https://app/api/prd", { evidence: [] }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat (anonymous)", () => {
  it("answers from the provided issues", async () => {
    callGeminiChat.mockResolvedValueOnce("Fix #1 first.");
    const res = await chat(
      req("https://app/api/chat", {
        messages: [{ role: "user", content: "What first?" }],
        issues: [{ title: "Checkout fails", frequency: 3, evidence: ["e"] }],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Fix #1 first." });
    expect(String(callGeminiChat.mock.calls[0][0])).toContain("Issue #1: Checkout fails");
  });

  it("requires the last message to be from the user", async () => {
    const res = await chat(req("https://app/api/chat", { messages: [{ role: "model", content: "hi" }], issues: [] }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/cron/monitor", () => {
  it("rejects requests without the cron secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await cronMonitor(new Request("https://app/api/cron/monitor", { headers: { authorization: "Bearer wrong" } }), ctx);
    expect(res.status).toBe(401);
  });

  it("is disabled when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;
    const res = await cronMonitor(new Request("https://app/api/cron/monitor", { headers: { authorization: "Bearer " } }), ctx);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/CRON_SECRET is not set/);
  });
});
