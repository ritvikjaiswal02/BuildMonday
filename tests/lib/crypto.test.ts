import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hmacSha256Hex,
  randomToken,
  secretHint,
  sha256Hex,
  timingSafeEqualStr,
} from "@/lib/auth/crypto";
import { HttpError } from "@/lib/auth/http";

const ORIGINAL = process.env.ENCRYPTION_KEY;

describe("encryptSecret and decryptSecret", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = ORIGINAL;
  });

  it("round-trips", () => {
    const secret = "https://hooks.slack.com/services/T000/B000/XXXXXXXX";
    const payload = encryptSecret(secret);
    expect(payload).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload)).toBe(secret);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("handles unicode", () => {
    expect(decryptSecret(encryptSecret("clé secrète ✓"))).toBe("clé secrète ✓");
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, cipher] = encryptSecret("lin_api_123456").split(":");
    const flipped = Buffer.from(cipher, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow(HttpError);
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-payload")).toThrow(HttpError);
    expect(() => decryptSecret("v2:a:b:c")).toThrow(HttpError);
  });

  it("rejects decryption with a different key", () => {
    const payload = encryptSecret("ghp_secret");
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(payload)).toThrow(HttpError);
  });

  it("requires a 32-byte key", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrowError(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    try {
      encryptSecret("x");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(503);
      expect((err as HttpError).code).toBe("not_configured");
    }
  });
});

describe("hashing and tokens", () => {
  it("sha256Hex matches a known vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hmacSha256Hex matches a known vector", () => {
    expect(hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("randomToken is base62 with the requested length", () => {
    expect(randomToken()).toMatch(/^[0-9A-Za-z]{24}$/);
    expect(randomToken(6)).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(randomToken(64)).toHaveLength(64);
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(seen.size).toBe(200);
  });

  it("timingSafeEqualStr compares exactly", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
    expect(timingSafeEqualStr("", "")).toBe(true);
  });

  it("secretHint shows the last four characters", () => {
    expect(secretHint("lin_api_abcdx9Qa")).toBe("x9Qa");
    expect(secretHint("  abcdef  ")).toBe("cdef");
    expect(secretHint("ab")).toBe("ab");
  });
});
