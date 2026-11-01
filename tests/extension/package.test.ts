import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildExtensionZip, PACKAGE_FOLDER, renderConfigModule, renderManifest } from "@/app/api/extension/_lib/package";
import { crc32, createZip } from "@/app/api/extension/_lib/zip";

const EXT_DIR = path.resolve(__dirname, "../../extension");

/** Reads every entry of a zip produced by createZip via its central directory. */
function readZip(zip: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(zip);
  const end = buf.length - 22;
  expect(buf.readUInt32LE(end)).toBe(0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  let ptr = buf.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(ptr)).toBe(0x02014b50);
    const method = buf.readUInt16LE(ptr + 10);
    const crc = buf.readUInt32LE(ptr + 16);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    expect(crc32(new Uint8Array(data))).toBe(crc);
    files.set(name, data);
    ptr += 46 + nameLen;
  }
  return files;
}

describe("zip writer", () => {
  it("computes standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("round-trips stored and deflated entries", () => {
    const zip = createZip([
      { name: "a.txt", data: "hi" },
      { name: "dir/b.json", data: JSON.stringify({ text: "x".repeat(2000) }) },
    ]);
    const files = readZip(zip);
    expect(files.get("a.txt")?.toString()).toBe("hi");
    expect(JSON.parse(files.get("dir/b.json")!.toString()).text).toHaveLength(2000);
  });
});

describe("extension package", () => {
  it("zips the extension with the server preset", async () => {
    const zip = await buildExtensionZip("https://feedback.acme.dev");
    expect(zip).not.toBeNull();
    const files = readZip(zip!);
    expect(files.has(`${PACKAGE_FOLDER}/manifest.json`)).toBe(true);
    expect(files.has(`${PACKAGE_FOLDER}/background.js`)).toBe(true);
    expect(files.has(`${PACKAGE_FOLDER}/icons/icon128.png`)).toBe(true);
    expect(files.get(`${PACKAGE_FOLDER}/lib/config.js`)!.toString()).toContain('"https://feedback.acme.dev"');
    // Byte-exact copy of binary files.
    expect(files.get(`${PACKAGE_FOLDER}/icons/icon16.png`)!.equals(readFileSync(path.join(EXT_DIR, "icons/icon16.png")))).toBe(true);
  });

  it("returns null when the folder is missing", async () => {
    expect(await buildExtensionZip("https://x.dev", path.join(EXT_DIR, "does-not-exist"))).toBeNull();
  });

  it("renders a config module the extension can import", () => {
    expect(renderConfigModule("http://localhost:3000")).toContain('export const DEFAULT_SERVER = "http://localhost:3000";');
    expect(renderConfigModule("http://localhost:3000")).toContain('export const DEFAULT_TOKEN = "";');
    expect(renderConfigModule("https://a.dev", "bm_ext_abc")).toContain('export const DEFAULT_TOKEN = "bm_ext_abc";');
  });

  it("lets this deployment's pages talk to the downloaded extension", () => {
    const manifest = JSON.parse(renderManifest('{"manifest_version":3,"name":"x"}', "https://feedback.acme.dev/app", "PUBKEY"));
    expect(manifest.externally_connectable).toEqual({ matches: ["https://feedback.acme.dev/*"] });
    expect(manifest.key).toBe("PUBKEY");
    expect(JSON.parse(renderManifest("{}", "https://a.dev")).key).toBeUndefined();
  });

  it("bakes a token into signed-in downloads", async () => {
    const zip = await buildExtensionZip("https://feedback.acme.dev", undefined, { token: "bm_ext_bundledbundledbundled" });
    const files = readZip(zip!);
    expect(files.get(`${PACKAGE_FOLDER}/lib/config.js`)!.toString()).toContain('"bm_ext_bundledbundledbundled"');
    const manifest = JSON.parse(files.get(`${PACKAGE_FOLDER}/manifest.json`)!.toString());
    expect(manifest.externally_connectable.matches).toEqual(["https://feedback.acme.dev/*"]);
  });
});

describe("manifest", () => {
  const manifest = JSON.parse(readFileSync(path.join(EXT_DIR, "manifest.json"), "utf8"));

  it("is a Manifest V3 extension with a module service worker", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(manifest.permissions).toEqual(expect.arrayContaining(["contextMenus", "storage", "activeTab", "scripting"]));
    expect(manifest).not.toHaveProperty("host_permissions");
  });

  it("references files that exist", () => {
    const referenced = [
      manifest.background.service_worker,
      manifest.action.default_popup,
      manifest.options_page,
      ...Object.values(manifest.icons as Record<string, string>),
      ...manifest.content_scripts.flatMap((c: { js: string[] }) => c.js),
    ];
    for (const rel of referenced) expect(existsSync(path.join(EXT_DIR, rel)), rel).toBe(true);
  });
});
