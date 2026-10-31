/**
 * Opaque keyset cursors for "newest first" lists: base64url of
 * "<ISO timestamp>|<id>". Invalid cursors decode to null (start from the top).
 */
export interface Cursor {
  at: Date;
  id: string;
}

export function encodeCursor(at: Date | string, id: string): string {
  const iso = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
  return Buffer.from(`${iso}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value || value.length > 200) return null;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const at = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(at.getTime()) || !id || id.length > 64) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** Parses a positive integer query parameter with bounds. */
export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = value === null ? NaN : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
