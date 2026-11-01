import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createZip, type ZipEntry } from "./zip";

/** Top-level folder inside the downloaded archive. */
export const PACKAGE_FOLDER = "buildmonday-extension";

async function walk(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "Thumbs.db") continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

/**
 * The config module shipped in the download, pointing the extension at this
 * deployment. When `token` is given (a signed-in download), the extension
 * connects itself on install and nobody has to paste a token.
 */
export function renderConfigModule(serverUrl: string, token: string | null = null): string {
  return [
    "// Written by BuildMonday when you downloaded the extension.",
    "// The server this copy connects to by default. You can change it on the options page.",
    `export const DEFAULT_SERVER = ${JSON.stringify(serverUrl)};`,
    "// A token for the workspace that downloaded this copy, used once on install.",
    "// It is listed (and can be revoked) on the Extension and widget page.",
    `export const DEFAULT_TOKEN = ${JSON.stringify(token ?? "")};`,
    "",
  ].join("\n");
}

/**
 * manifest.json for the download: lets pages of this deployment talk to the
 * extension ("Connect this browser"), and pins the extension id when a public
 * key is configured, so the page knows which id to message.
 */
export function renderManifest(raw: string, serverUrl: string, publicKey: string | null = null): string {
  const manifest = JSON.parse(raw) as Record<string, unknown>;
  let origin: string | null = null;
  try {
    origin = new URL(serverUrl).origin;
  } catch {
    origin = null;
  }
  if (origin) manifest.externally_connectable = { matches: [`${origin}/*`] };
  if (publicKey) manifest.key = publicKey;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Zips the extension folder from the repository, with lib/config.js rewritten
 * so the default server is this deployment. Returns null when the folder is
 * not available (for example when it was not traced into the deployment).
 */
export async function buildExtensionZip(
  serverUrl: string,
  root = path.join(process.cwd(), "extension"),
  opts: { token?: string | null; publicKey?: string | null } = {},
): Promise<Uint8Array | null> {
  let files: string[];
  try {
    files = await walk(root);
  } catch {
    return null;
  }
  if (!files.includes("manifest.json")) return null;

  const entries: ZipEntry[] = [];
  for (const rel of files) {
    if (rel === "lib/config.js") {
      entries.push({ name: `${PACKAGE_FOLDER}/${rel}`, data: renderConfigModule(serverUrl, opts.token ?? null) });
      continue;
    }
    if (rel === "manifest.json") {
      const raw = await readFile(path.join(root, rel), "utf8");
      entries.push({ name: `${PACKAGE_FOLDER}/${rel}`, data: renderManifest(raw, serverUrl, opts.publicKey ?? null) });
      continue;
    }
    const data = await readFile(path.join(root, rel));
    entries.push({ name: `${PACKAGE_FOLDER}/${rel}`, data: new Uint8Array(data) });
  }
  return createZip(entries);
}
