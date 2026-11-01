import { describe, expect, it } from "vitest";
import {
  toApiTokenDTO,
  toFeedbackDTO,
  toIntegrationDTO,
  toIssueDTO,
  toProductDTO,
  toRunDTO,
  toSourceDTO,
} from "@/lib/db/dto";
import {
  DEFAULT_WIDGET_SETTINGS,
  EMPTY_RUN_STATS,
  FEEDBACK_SOURCE_KINDS,
  type ApiToken,
  type Feedback,
  type Integration,
  type Issue,
  type Product,
  type Run,
  type Source,
} from "@/lib/db/schema";

const t0 = new Date("2026-11-01T09:00:00.000Z");
const t1 = new Date("2026-11-01T09:01:30.000Z");

describe("schema constants", () => {
  it("extends monitor kinds with inbox kinds", () => {
    expect(FEEDBACK_SOURCE_KINDS).toEqual(["appstore", "playstore", "reddit", "hackernews", "trustpilot", "widget", "extension", "manual", "import"]);
  });

  it("starts runs empty", () => {
    expect(EMPTY_RUN_STATS.stage).toBe("queued");
    expect(EMPTY_RUN_STATS.quotaReached).toBe(false);
    expect(EMPTY_RUN_STATS.skippedReason).toBeNull();
    expect(EMPTY_RUN_STATS.perSource).toEqual([]);
  });
});

describe("DTO mappers", () => {
  it("maps products", () => {
    const row: Product = {
      id: "p1",
      workspaceId: "w1",
      name: "Acme Notes",
      websiteUrl: null,
      description: null,
      publicKey: "pk_x",
      monitoringEnabled: true,
      lastRunAt: t0,
      nextRunAt: null,
      alertThreshold: 70,
      autofileEnabled: false,
      autofileTarget: null,
      autofileThreshold: 80,
      widgetSettings: DEFAULT_WIDGET_SETTINGS,
      allowedOrigins: [],
      archivedAt: null,
      createdAt: t0,
      updatedAt: t0,
    };
    const dto = toProductDTO(row);
    expect(dto).toMatchObject({ id: "p1", lastRunAt: t0.toISOString(), nextRunAt: null, createdAt: t0.toISOString() });
    expect(dto).not.toHaveProperty("workspaceId");
    expect(dto).not.toHaveProperty("archivedAt");
  });

  it("maps sources", () => {
    const row: Source = {
      id: "s1",
      workspaceId: "w1",
      productId: "p1",
      kind: "appstore",
      config: { appId: "123", country: "us" },
      label: "App Store (US) 123",
      role: "own",
      competitorName: null,
      enabled: true,
      lastFetchedAt: null,
      lastSuccessAt: t1,
      lastError: null,
      lastItemCount: 12,
      createdAt: t0,
      updatedAt: t0,
    };
    expect(toSourceDTO(row)).toMatchObject({ lastSuccessAt: t1.toISOString(), lastItemCount: 12 });
  });

  it("maps feedback with site and issue title", () => {
    const row: Feedback = {
      id: "f1",
      workspaceId: "w1",
      productId: "p1",
      sourceId: null,
      channel: "extension",
      sourceKind: "extension",
      role: "own",
      competitorName: null,
      externalId: null,
      dedupeKey: "k",
      text: "Sync loses my notes",
      title: null,
      author: null,
      authorEmail: null,
      rating: 2,
      url: null,
      postedAt: null,
      ingestedAt: t0,
      status: "new",
      issueId: "i1",
      tags: null,
      meta: { site: "g2", userAgent: "x" },
    };
    const dto = toFeedbackDTO(row, "Sync fails");
    expect(dto.site).toBe("g2");
    expect(dto.issueTitle).toBe("Sync fails");
    expect(dto).not.toHaveProperty("dedupeKey");
    expect(toFeedbackDTO({ ...row, meta: {} }).site).toBeNull();
  });

  it("maps issues without the embedding", () => {
    const row: Issue = {
      id: "i1",
      workspaceId: "w1",
      productId: "p1",
      scope: "own",
      competitorName: null,
      title: "Sync fails",
      rankingReason: "Most frequent",
      category: "sync",
      severity: "High",
      churnRisk: "High",
      effort: "M",
      affectedSegment: "students",
      recommendedAction: "fix_now",
      priorityScore: 88,
      frequency: 12,
      rank: 1,
      evidence: ["a"],
      sourceMix: { appstore: 10, reddit: 2 },
      status: "backlog",
      trend: "new",
      embedding: [0.1, 0.2],
      prd: null,
      prdGeneratedAt: null,
      externalTarget: null,
      externalId: null,
      externalUrl: null,
      filedAt: null,
      firstSeenRunId: "r1",
      lastSeenRunId: "r1",
      firstSeenAt: t0,
      lastSeenAt: t1,
      resolvedAt: null,
      createdAt: t0,
      updatedAt: t1,
    };
    const dto = toIssueDTO(row);
    expect(dto).not.toHaveProperty("embedding");
    expect(dto).not.toHaveProperty("externalId");
    expect(dto).toMatchObject({ priorityScore: 88, lastSeenAt: t1.toISOString(), updatedAt: t1.toISOString() });
  });

  it("maps runs with duration", () => {
    const row: Run = {
      id: "r1",
      workspaceId: "w1",
      productId: "p1",
      trigger: "manual",
      status: "succeeded",
      stats: EMPTY_RUN_STATS,
      error: null,
      startedAt: t0,
      finishedAt: t1,
      createdAt: t0,
    };
    expect(toRunDTO(row).durationMs).toBe(90_000);
    expect(toRunDTO({ ...row, finishedAt: null }).durationMs).toBeNull();
  });

  it("never exposes integration secrets or token hashes", () => {
    const integration: Integration = {
      id: "x",
      workspaceId: "w1",
      kind: "slack",
      config: { kind: "slack", channelName: "#product" },
      secretEncrypted: "v1:a:b:c",
      secretHint: "x9Qa",
      status: "connected",
      lastError: null,
      createdAt: t0,
      updatedAt: t1,
    };
    const idto = toIntegrationDTO(integration);
    expect(idto).not.toHaveProperty("secretEncrypted");
    expect(idto.connectedAt).toBe(t1.toISOString());

    const token: ApiToken = {
      id: "t1",
      workspaceId: "w1",
      userId: "u1",
      name: "Laptop",
      tokenHash: "deadbeef",
      prefix: "bm_ext_A1b2C",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: t0,
    };
    const tdto = toApiTokenDTO(token);
    expect(tdto).not.toHaveProperty("tokenHash");
    expect(tdto).toEqual({ id: "t1", name: "Laptop", prefix: "bm_ext_A1b2C", lastUsedAt: null, createdAt: t0.toISOString(), revokedAt: null });
  });
});
