/**
 * Pure plan-limit allocation for sources. Used by onboarding (many sources at
 * once) and by the single-source routes, so the rules live in one place:
 *
 * - The same source (kind + config) is only saved once per product.
 * - Own sources come before competitor sources when filling the plan limit.
 * - Sources beyond `sources_per_product` are saved but paused (enabled false).
 * - Competitor sources need `competitor_tracking`; without it they are not saved.
 * - Distinct competitor names beyond the `competitors` limit are not saved.
 */
import type { MonitorSourceKind, SourceConfig, SourceRole } from "@/lib/db/schema";
import { sourceFingerprint } from "@/components/onboarding/source-input";

export interface SourceCandidate {
  kind: MonitorSourceKind;
  config: unknown;
  role: SourceRole;
  competitorName?: string | null;
}

export type SkipReason = "limit" | "plan" | "invalid";

export interface SkippedSource {
  kind: MonitorSourceKind;
  label: string;
  reason: SkipReason;
  message: string;
}

export interface AllocatedSource {
  kind: MonitorSourceKind;
  config: SourceConfig;
  role: SourceRole;
  competitorName: string | null;
  label: string;
  enabled: boolean;
}

export interface AllocationLimits {
  /** sources_per_product; -1 = unlimited */
  sourceLimit: number;
  competitorTracking: boolean;
  /** competitors (distinct names per product); -1 = unlimited */
  competitorLimit: number;
  /** Enabled sources the product already has. */
  existingEnabled?: number;
  /** Fingerprints of sources the product already has. */
  existingFingerprints?: Iterable<string>;
  /** Lower-cased competitor names the product already tracks. */
  existingCompetitors?: Iterable<string>;
}

export type ConfigValidator = (
  kind: MonitorSourceKind,
  config: unknown,
) => { ok: true; config: SourceConfig } | { ok: false; error: string };

export type Labeler = (kind: MonitorSourceKind, config: SourceConfig) => string;

const KIND_NAMES: Record<MonitorSourceKind, string> = {
  appstore: "App Store",
  playstore: "Google Play",
  reddit: "Reddit",
  hackernews: "Hacker News",
  trustpilot: "Trustpilot",
};

export function normalizeCompetitorName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 60) : null;
}

function unlimited(n: number): boolean {
  return n < 0;
}

export function allocateSources(
  candidates: SourceCandidate[],
  limits: AllocationLimits,
  validate: ConfigValidator,
  labelFor: Labeler,
): { toInsert: AllocatedSource[]; skipped: SkippedSource[] } {
  const toInsert: AllocatedSource[] = [];
  const skipped: SkippedSource[] = [];
  const seen = new Set<string>(limits.existingFingerprints ?? []);
  const competitorNames = new Set<string>(
    Array.from(limits.existingCompetitors ?? [], (n) => n.toLowerCase()),
  );
  let enabledCount = limits.existingEnabled ?? 0;

  // Own sources first so they win the plan's slots; order within a role is kept.
  const ordered = [
    ...candidates.filter((c) => c.role !== "competitor"),
    ...candidates.filter((c) => c.role === "competitor"),
  ];

  for (const candidate of ordered) {
    const result = validate(candidate.kind, candidate.config);
    if (!result.ok) {
      skipped.push({
        kind: candidate.kind,
        label: KIND_NAMES[candidate.kind] ?? candidate.kind,
        reason: "invalid",
        message: result.error,
      });
      continue;
    }
    const config = result.config;
    const label = labelFor(candidate.kind, config);
    const fingerprint = sourceFingerprint(candidate.kind, config);
    if (seen.has(fingerprint)) continue; // silently drop duplicates
    seen.add(fingerprint);

    let competitorName: string | null = null;
    if (candidate.role === "competitor") {
      competitorName = normalizeCompetitorName(candidate.competitorName);
      if (!competitorName) {
        skipped.push({ kind: candidate.kind, label, reason: "invalid", message: "Competitor sources need a name." });
        continue;
      }
      if (!limits.competitorTracking) {
        skipped.push({
          kind: candidate.kind,
          label,
          reason: "plan",
          message: "Competitor tracking is on Pro and Team. This competitor was not saved.",
        });
        continue;
      }
      const key = competitorName.toLowerCase();
      if (!competitorNames.has(key)) {
        if (!unlimited(limits.competitorLimit) && competitorNames.size >= limits.competitorLimit) {
          skipped.push({
            kind: candidate.kind,
            label,
            reason: "limit",
            message: `Your plan tracks ${limits.competitorLimit} ${limits.competitorLimit === 1 ? "competitor" : "competitors"} per product. ${competitorName} was not saved.`,
          });
          continue;
        }
        competitorNames.add(key);
      }
    }

    const fits = unlimited(limits.sourceLimit) || enabledCount < limits.sourceLimit;
    if (fits) enabledCount += 1;
    else {
      skipped.push({
        kind: candidate.kind,
        label,
        reason: "limit",
        message: `Saved but paused. Your plan watches ${limits.sourceLimit} ${limits.sourceLimit === 1 ? "source" : "sources"} per product.`,
      });
    }

    toInsert.push({
      kind: candidate.kind,
      config,
      role: candidate.role,
      competitorName,
      label,
      enabled: fits,
    });
  }

  return { toInsert, skipped };
}
