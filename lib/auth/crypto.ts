import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { HttpError } from "./http";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function encryptionKey(): Buffer {
  const raw = env.ENCRYPTION_KEY;
  if (!raw) {
    throw new HttpError(503, "not_configured", "ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new HttpError(
      503,
      "not_configured",
      "ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)",
    );
  }
  return key;
}

/** AES-256-GCM. Output: "v1:<iv b64>:<tag b64>:<cipher b64>". */
export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** Throws HttpError(500, "internal") when the payload is malformed or was tampered with. */
export function decryptSecret(payload: string): string {
  const key = encryptionKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new HttpError(500, "internal", "A stored secret could not be read. Reconnect the integration.");
  }
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const encrypted = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new HttpError(500, "internal", "A stored secret could not be read. Reconnect the integration.");
  }
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// Largest multiple of 62 below 256, for unbiased rejection sampling.
const BASE62_CUTOFF = 248;

/**
 * Random base62 string of `length` characters (default 24, about 143 bits).
 * Uses rejection sampling so every character is uniformly distributed.
 */
export function randomToken(length = 24): string {
  let out = "";
  while (out.length < length) {
    const buf = randomBytes(Math.max(16, (length - out.length) * 2));
    for (const byte of buf) {
      if (byte >= BASE62_CUTOFF) continue;
      out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Constant-time string comparison that does not leak length differences. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

/** Last 4 characters, shown in settings so people can recognise a saved secret. */
export function secretHint(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}
