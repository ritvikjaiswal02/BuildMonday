import { createHash } from "node:crypto";
import type { FeedbackSourceKind } from "@/lib/db/schema";

/**
 * Normalises feedback text for duplicate detection: lower case, Unicode NFKC,
 * no URLs, no punctuation runs, single spaces. Two copies of the same review
 * pasted with different whitespace or quotes produce the same key.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    // Keep letters, combining marks (Indic vowel signs, accents) and digits.
    .replace(/[^\p{L}\p{M}\p{N}'"]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * sha256 hex of productId + sourceKind + (externalId or normalised text).
 * The unique index (productId, dedupeKey) makes inserts idempotent.
 */
export function dedupeKey(
  productId: string,
  kind: FeedbackSourceKind,
  item: { externalId?: string | null; text: string },
): string {
  const externalId = item.externalId?.trim();
  const basis = externalId ? `id:${externalId}` : `text:${normalizeText(item.text)}`;
  return createHash("sha256").update(`${productId}\u0000${kind}\u0000${basis}`, "utf8").digest("hex");
}
