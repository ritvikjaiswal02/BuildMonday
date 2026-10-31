import "server-only";

import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { compactVector, embedBatch } from "@/lib/embeddings";
import { db } from "@/lib/db";
import {
  feedback,
  issueSnapshots,
  issues,
  type Feedback,
  type FeedbackTags,
  type NewIssue,
  type Product,
  type Run,
  type SourceRole,
} from "@/lib/db/schema";
import type { Issue, TaggedComplaint } from "@/lib/types";
import { issueSignature } from "./diff";
import { sourceMixToKinds } from "./mappers";
import { majority, planIssueUpdates } from "./plan";

/** Stored issues older than this are not matched against (they start fresh). */
const MATCH_WINDOW_DAYS = 60;
const UPDATE_CHUNK = 200;

export interface ScopeOutcome {
  newIds: string[];
  worsenedIds: string[];
  improvedIds: string[];
  persistentIds: string[];
  resolvedIds: string[];
}

function emptyOutcome(): ScopeOutcome {
  return { newIds: [], worsenedIds: [], improvedIds: [], persistentIds: [], resolvedIds: [] };
}

/** Saves pass-1 tags on the analysed feedback rows in one statement per chunk. */
export async function saveFeedbackTags(rows: Feedback[], tagged: TaggedComplaint[]): Promise<void> {
  const pairs: Array<{ id: string; tags: FeedbackTags }> = [];
  rows.forEach((row, i) => {
    const t = tagged[i];
    if (!t) return;
    pairs.push({
      id: row.id,
      tags: {
        category: t.category,
        severity: t.severity,
        churn_signal: t.churn_signal,
        affected_segment: t.affected_segment,
        urgency_keywords: t.urgency_keywords,
      },
    });
  });
  for (let i = 0; i < pairs.length; i += UPDATE_CHUNK) {
    const slice = pairs.slice(i, i + UPDATE_CHUNK);
    const values = sql.join(
      slice.map((p) => sql`(${p.id}, ${JSON.stringify(p.tags)}::jsonb)`),
      sql`, `,
    );
    await db.execute(
      sql`update ${feedback} set tags = v.tags from (values ${values}) as v(id, tags) where ${feedback.id} = v.id`,
    );
  }
}

function embeddingUsable(e: number[] | null | undefined, dims: number): e is number[] {
  return Array.isArray(e) && e.length === dims && e.length > 0;
}

/**
 * Diffs this run's clusters for one scope (own or competitor) against stored
 * issues and writes the result: updates matched issues, inserts new ones,
 * marks resolved ones, writes snapshots and links member feedback.
 */
export async function persistScope(args: {
  run: Run;
  product: Product;
  scope: SourceRole;
  clusters: Issue[];
  /** The feedback rows that were analysed, in analysis order (member_indices are 1-based into this). */
  analysed: Feedback[];
  previousRunId: string | null;
  now: Date;
}): Promise<ScopeOutcome> {
  const { run, product, scope, clusters, analysed, now } = args;
  const outcome = emptyOutcome();

  const windowStart = new Date(now.getTime() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const stored = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.productId, product.id),
        eq(issues.scope, scope),
        ne(issues.status, "ignored"),
        gte(issues.lastSeenAt, windowStart),
      ),
    );

  if (clusters.length === 0 && stored.length === 0) return outcome;

  const clusterEmbeds = clusters.length > 0 ? (await embedBatch(clusters.map(issueSignature))).map((v) => compactVector(v)) : [];
  const dims = clusterEmbeds[0]?.length ?? 0;

  // Stored issues without a usable vector (missing, or from another model) are embedded again.
  const needEmbedding = stored.map((s, i) => ({ s, i })).filter(({ s }) => dims > 0 && !embeddingUsable(s.embedding, dims));
  const storedEmbeds: number[][] = stored.map((s) => (embeddingUsable(s.embedding, dims) ? s.embedding : []));
  if (needEmbedding.length > 0) {
    const fresh = (await embedBatch(needEmbedding.map(({ s }) => issueSignature(s)))).map((v) => compactVector(v));
    needEmbedding.forEach(({ i }, k) => {
      storedEmbeds[i] = fresh[k] ?? [];
    });
  }

  const plan = planIssueUpdates({
    clusterFrequencies: clusters.map((c) => c.frequency),
    clusterEmbeds,
    stored: stored.map((s) => ({ id: s.id, frequency: s.frequency, lastSeenRunId: s.lastSeenRunId })),
    storedEmbeds,
    previousRunId: args.previousRunId,
  });

  const memberRows = (c: Issue): Feedback[] =>
    (c.member_indices ?? []).map((m) => analysed[m - 1]).filter((f): f is Feedback => Boolean(f));

  const competitorFor = (c: Issue): string | null =>
    scope === "competitor" ? majority(memberRows(c).map((f) => f.competitorName)) : null;

  const clusterFields = (c: Issue, rank: number) => ({
    rankingReason: c.ranking_reason ?? null,
    category: c.category ?? null,
    severity: c.severity,
    churnRisk: c.churn_risk,
    effort: c.effort,
    affectedSegment: c.affected_segment,
    recommendedAction: c.recommended_action,
    priorityScore: c.priority_score,
    frequency: c.frequency,
    rank,
    evidence: c.evidence,
    sourceMix: sourceMixToKinds(c.source_mix),
  });

  const issueIdByCluster = new Map<number, string>();

  await db.transaction(async (tx) => {
    // Matched: refresh fields, keep the stored title (people may have renamed it).
    for (const m of plan.matched) {
      const c = clusters[m.cluster];
      await tx
        .update(issues)
        .set({
          ...clusterFields(c, m.cluster + 1),
          competitorName: competitorFor(c) ?? undefined,
          trend: m.trend,
          embedding: clusterEmbeds[m.cluster],
          lastSeenRunId: run.id,
          lastSeenAt: now,
          resolvedAt: null,
        })
        .where(eq(issues.id, m.issueId));
      issueIdByCluster.set(m.cluster, m.issueId);
      if (m.trend === "worsened") outcome.worsenedIds.push(m.issueId);
      else if (m.trend === "improved") outcome.improvedIds.push(m.issueId);
      else outcome.persistentIds.push(m.issueId);
    }

    // New issues.
    if (plan.created.length > 0) {
      const values: NewIssue[] = plan.created.map((ci) => {
        const c = clusters[ci];
        return {
          workspaceId: product.workspaceId,
          productId: product.id,
          scope,
          competitorName: competitorFor(c),
          title: c.title,
          ...clusterFields(c, ci + 1),
          status: "backlog",
          trend: "new",
          embedding: clusterEmbeds[ci] ?? null,
          firstSeenRunId: run.id,
          lastSeenRunId: run.id,
          firstSeenAt: now,
          lastSeenAt: now,
        };
      });
      const inserted = await tx.insert(issues).values(values).returning({ id: issues.id });
      inserted.forEach((row, k) => {
        issueIdByCluster.set(plan.created[k], row.id);
        outcome.newIds.push(row.id);
      });
    }

    // Resolved.
    if (plan.resolved.length > 0) {
      await tx
        .update(issues)
        .set({ trend: "resolved", resolvedAt: now, rank: null })
        .where(inArray(issues.id, plan.resolved));
      outcome.resolvedIds.push(...plan.resolved);
    }

    // Stored vectors that were missing or stale.
    for (const { s, i } of needEmbedding) {
      if (plan.matched.some((m) => m.issueId === s.id)) continue;
      if (storedEmbeds[i]?.length) {
        await tx.update(issues).set({ embedding: storedEmbeds[i] }).where(eq(issues.id, s.id));
      }
    }

    // Snapshots: one per issue in this run, including resolved ones at zero.
    const snapshotRows = [
      ...Array.from(issueIdByCluster.entries()).map(([ci, issueId]) => {
        const matched = plan.matched.find((m) => m.cluster === ci);
        return {
          issueId,
          runId: run.id,
          productId: product.id,
          frequency: clusters[ci].frequency,
          priorityScore: clusters[ci].priority_score,
          rank: ci + 1,
          trend: matched ? matched.trend : ("new" as const),
        };
      }),
      ...plan.resolved.map((issueId) => {
        const s = stored.find((x) => x.id === issueId);
        return {
          issueId,
          runId: run.id,
          productId: product.id,
          frequency: 0,
          priorityScore: s?.priorityScore ?? 0,
          rank: null,
          trend: "resolved" as const,
        };
      }),
    ];
    if (snapshotRows.length > 0) {
      await tx.insert(issueSnapshots).values(snapshotRows).onConflictDoNothing();
    }

    // Link member feedback to its issue and mark new rows triaged.
    for (const [ci, issueId] of issueIdByCluster) {
      const ids = memberRows(clusters[ci]).map((f) => f.id);
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
        await tx
          .update(feedback)
          .set({
            issueId,
            status: sql`case when ${feedback.status} = 'new' then 'triaged' else ${feedback.status} end`,
          })
          .where(and(inArray(feedback.id, ids.slice(i, i + UPDATE_CHUNK)), eq(feedback.productId, product.id)));
      }
    }
  });

  return outcome;
}
