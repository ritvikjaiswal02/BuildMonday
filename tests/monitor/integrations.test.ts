import { afterEach, describe, expect, it, vi } from "vitest";
import { parseModelJson } from "@/lib/gemini";
import {
  buildIssueMarkdown,
  createGitHubIssue,
  createLinearIssue,
  listLinearTeams,
  verifyGitHubRepo,
} from "@/lib/integrations";
import type { Issue } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Linear client", () => {
  it("lists teams sorted by name, sending the key as Authorization", async () => {
    const fetchMock = vi.fn(async () =>
      json({ data: { teams: { nodes: [{ id: "2", name: "Web", key: "WEB" }, { id: "1", name: "Mobile", key: "MOB" }] } } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const teams = await listLinearTeams(" lin_api_123 ");
    expect(teams.map((t) => t.key)).toEqual(["MOB", "WEB"]);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("lin_api_123");
  });

  it("explains a bad key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ errors: [{ message: "Authentication required, not authenticated" }] }, 400)));
    await expect(listLinearTeams("bad")).rejects.toThrow(/did not accept this API key/);
  });

  it("creates an issue with a matching label when one exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: { team: { labels: { nodes: [{ id: "lbl", name: "Customer feedback" }] } }, issueLabels: { nodes: [] } } }))
      .mockResolvedValueOnce(json({ data: { issueCreate: { success: true, issue: { id: "x", identifier: "MOB-12", url: "https://linear.app/x" } } } }));
    vi.stubGlobal("fetch", fetchMock);
    const created = await createLinearIssue({ apiKey: "k", teamId: "t", title: "T", description: "D", labelName: "customer feedback" });
    expect(created.identifier).toBe("MOB-12");
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(body.variables.input).toMatchObject({ teamId: "t", title: "T", labelIds: ["lbl"] });
  });
});

describe("GitHub client", () => {
  it("verifies a repository", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ full_name: "acme/app", private: true, has_issues: true })));
    await expect(verifyGitHubRepo("t", "acme", "app")).resolves.toEqual({ fullName: "acme/app", private: true });
  });

  it("maps 404 and disabled issues to clear messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not Found" }, 404)));
    await expect(verifyGitHubRepo("t", "acme", "nope")).rejects.toThrow(/could not find that repository/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ full_name: "acme/app", private: false, has_issues: false })));
    await expect(verifyGitHubRepo("t", "acme", "app")).rejects.toThrow(/Issues are turned off/);
  });

  it("creates an issue with labels", async () => {
    const fetchMock = vi.fn(async () => json({ number: 7, html_url: "https://github.com/acme/app/issues/7" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const created = await createGitHubIssue({ token: "t", owner: "acme", repo: "app", title: "T", body: "B", labels: [" bug ", ""] });
    expect(created).toEqual({ number: 7, url: "https://github.com/acme/app/issues/7" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/app/issues");
    expect(JSON.parse(String(init.body))).toEqual({ title: "T", body: "B", labels: ["bug"] });
  });
});

describe("buildIssueMarkdown", () => {
  const issue: Issue = {
    title: "Checkout fails",
    frequency: 3,
    severity: "High",
    churn_risk: "High",
    effort: "S",
    affected_segment: "Buyers",
    evidence: ["It fails"],
    recommended_action: "fix_now",
    priority_score: 90,
  };

  it("adds a link back when given one and accepts the ignored status", () => {
    const md = buildIssueMarkdown(issue, null, "ignored", { link: "https://app.example/issues/1" });
    expect(md.body).toContain("**Status:** Ignored");
    expect(md.body).toContain("[View this issue in BuildMonday](https://app.example/issues/1)");
  });

  it("keeps untrusted quotes inside the blockquote and stops mentions and links", () => {
    const md = buildIssueMarkdown(
      { ...issue, evidence: ["Broken!\n\n# Injected heading\n@acme/maintainers see [here](https://evil.example)"] },
      null,
    );
    expect(md.body.split("\n").some((l) => l.startsWith("> Broken"))).toBe(true);
    expect(md.body).not.toContain("\n# Injected");
    expect(md.body).not.toContain(" @acme/maintainers");
    expect(md.body).toContain("@​acme/maintainers");
    expect(md.body).not.toContain("[here](https://evil.example)");
  });
});

describe("parseModelJson", () => {
  it("reads fenced JSON and JSON wrapped in prose", () => {
    expect(parseModelJson("```json\n[1,2]\n```")).toEqual([1, 2]);
    expect(parseModelJson('Here you go: {"a": 1} hope it helps')).toEqual({ a: 1 });
  });

  it("throws on non-JSON", () => {
    expect(() => parseModelJson("no json here")).toThrow();
  });
});
