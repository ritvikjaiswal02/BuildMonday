import { describe, expect, it } from "vitest";
import { ingestWithStore, type IngestStore } from "@/lib/feedback/ingest";
import { dedupeKey } from "@/lib/sources/dedupe";

/** In-memory store with per-metric quotas. */
function fakeStore(opts: { existing?: string[]; quota?: Partial<Record<string, number>>; loseRaces?: number } = {}) {
  const keys = new Set(opts.existing ?? []);
  const used: Record<string, number> = {};
  const inserted: Array<{ dedupeKey: string; status: string; channel: string }> = [];
  let raceLosses = opts.loseRaces ?? 0;
  const store: IngestStore = {
    async existingKeys(_productId, list) {
      return new Set(list.filter((k) => keys.has(k)));
    },
    async consume(_ws, metric, amount) {
      const max = opts.quota?.[metric] ?? Infinity;
      const have = used[metric] ?? 0;
      const allowed = Math.max(0, Math.min(amount, max - have));
      used[metric] = have + allowed;
      return allowed;
    },
    async refund(_ws, metric, amount) {
      used[metric] = Math.max(0, (used[metric] ?? 0) - amount);
    },
    async insert(rows) {
      const ids: string[] = [];
      for (const r of rows) {
        if (raceLosses > 0) {
          raceLosses--;
          continue;
        }
        keys.add(r.dedupeKey);
        inserted.push({ dedupeKey: r.dedupeKey, status: r.status, channel: r.channel });
        ids.push(`id-${inserted.length}`);
      }
      return ids;
    },
  };
  return { store, used, inserted };
}

const base = { workspaceId: "w1", productId: "p1", channel: "manual" as const };

describe("ingestWithStore", () => {
  it("inserts new items and counts quota", async () => {
    const { store, used, inserted } = fakeStore();
    const r = await ingestWithStore(store, {
      ...base,
      items: [
        { text: "First complaint", sourceKind: "manual" },
        { text: "Second complaint", sourceKind: "manual" },
        { text: "no", sourceKind: "manual" },
      ],
    });
    expect(r).toMatchObject({ inserted: 2, duplicates: 0, rejected: 1, quotaExceeded: false });
    expect(r.ids).toHaveLength(2);
    expect(used.feedback_items_per_month).toBe(2);
    expect(inserted.every((i) => i.channel === "manual")).toBe(true);
  });

  it("never charges quota for known duplicates", async () => {
    const known = dedupeKey("p1", "manual", { text: "Already here" });
    const { store, used } = fakeStore({ existing: [known] });
    const r = await ingestWithStore(store, { ...base, items: [{ text: "already  HERE", sourceKind: "manual" }] });
    expect(r).toMatchObject({ inserted: 0, duplicates: 1 });
    expect(used.feedback_items_per_month).toBeUndefined();
  });

  it("stores what fits and flags the quota", async () => {
    const { store } = fakeStore({ quota: { feedback_items_per_month: 1 } });
    const r = await ingestWithStore(store, {
      ...base,
      items: [
        { text: "One complaint", sourceKind: "manual" },
        { text: "Two complaint", sourceKind: "manual" },
      ],
    });
    expect(r).toMatchObject({ inserted: 1, quotaExceeded: true });
  });

  it("skips quota when told to", async () => {
    const { store, used } = fakeStore({ quota: { feedback_items_per_month: 0 } });
    const r = await ingestWithStore(store, { ...base, enforceQuota: false, items: [{ text: "Free pass", sourceKind: "manual" }] });
    expect(r.inserted).toBe(1);
    expect(used.feedback_items_per_month).toBeUndefined();
  });

  it("counts extension clips and refunds clips the feedback quota could not take", async () => {
    const { store, used } = fakeStore({ quota: { extension_clips_per_month: 5, feedback_items_per_month: 2 } });
    const r = await ingestWithStore(store, {
      ...base,
      channel: "extension",
      quotaMetric: "extension_clips_per_month",
      items: ["a clip", "b clip", "c clip"].map((text) => ({ text, sourceKind: "extension" as const })),
    });
    expect(r).toMatchObject({ inserted: 2, quotaExceeded: true });
    expect(used.extension_clips_per_month).toBe(2);
    expect(used.feedback_items_per_month).toBe(2);
  });

  it("treats rows lost to a concurrent insert as duplicates and refunds them", async () => {
    const { store, used } = fakeStore({ loseRaces: 1 });
    const r = await ingestWithStore(store, {
      ...base,
      items: [
        { text: "Racing one", sourceKind: "manual" },
        { text: "Racing two", sourceKind: "manual" },
      ],
    });
    expect(r).toMatchObject({ inserted: 1, duplicates: 1 });
    expect(used.feedback_items_per_month).toBe(1);
  });

  it("passes through an explicit spam status", async () => {
    const { store, inserted } = fakeStore();
    await ingestWithStore(store, { ...base, channel: "widget", items: [{ text: "lots of links", sourceKind: "widget", status: "spam" }] });
    expect(inserted[0].status).toBe("spam");
  });
});
