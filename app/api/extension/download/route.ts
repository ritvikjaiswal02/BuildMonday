import { errorResponse, withRoute } from "@/lib/auth/http";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/auth/rate-limit";
import { getSessionContext } from "@/lib/auth/session";
import { createApiToken } from "@/lib/auth/tokens";
import { env } from "@/lib/env";
import { MAX_ACTIVE_TOKENS } from "../_lib/clip";
import { buildExtensionZip } from "../_lib/package";
import { countActiveTokens } from "../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A token for a signed-in download from this deployment's own pages, so the
 * extension connects itself on install. Cross-site requests (Sec-Fetch-Site
 * other than same-origin) never mint one.
 */
async function tokenForDownload(req: Request): Promise<string | null> {
  if (req.headers.get("sec-fetch-site") !== "same-origin") return null;
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const limited = await rateLimit(`ext-download-token:${ctx.user.id}`, { limit: 10, windowSec: 3600 });
  if (!limited.ok) return null;
  if ((await countActiveTokens(ctx.workspace.id)) >= MAX_ACTIVE_TOKENS) return null;
  const { token } = await createApiToken({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    name: `Downloaded ${DATE.format(new Date())}`,
  });
  return token;
}

/** GET /api/extension/download: the Chrome extension as a zip, preset to this deployment's URL. */
export const GET = withRoute(async (req: Request) => {
  const limited = await rateLimit(`ext-download:${clientIp(req)}`, { limit: 30, windowSec: 3600 });
  if (!limited.ok) {
    return errorResponse(
      429,
      "rate_limited",
      "Too many downloads from this network. Try again in an hour.",
      undefined,
      rateLimitHeaders(limited),
    );
  }

  let token: string | null = null;
  try {
    token = await tokenForDownload(req);
  } catch (err) {
    // A plain download still works; the token can be pasted instead.
    console.warn("[extension] could not mint a download token", err);
  }

  const zip = await buildExtensionZip(env.APP_URL, undefined, { token, publicKey: env.EXTENSION_PUBLIC_KEY ?? null });
  if (!zip) {
    return errorResponse(
      503,
      "not_configured",
      "The extension package is not part of this deployment. Load it from the extension folder of the BuildMonday repository.",
    );
  }

  const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=\"buildmonday-extension.zip\"",
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "no-store, private",
    },
  });
});
