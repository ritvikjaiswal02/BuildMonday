/** Pure vector helpers, safe on the client and in tests. */

/** Rounds components so stored vectors stay small in jsonb. */
export function compactVector(v: number[], digits = 6): number[] {
  const f = 10 ** digits;
  return v.map((x) => Math.round(x * f) / f);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
