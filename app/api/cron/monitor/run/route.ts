import { waitUntil } from "@vercel/functions";
import { errorResponse, json, withRoute } from "@/lib/auth/http";
import { runClaimedProduct } from "@/lib/monitor";
import { checkCronAuth } from "../../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Worker for one scheduled run, called by /api/cron/monitor with the cron
 * secret. Answers 202 at once and runs the product in the background of this
 * invocation, which has the full 300 seconds to itself.
 */
export const POST = withRoute(async (req) => {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const productId = new URL(req.url).searchParams.get("productId") ?? "";
  if (!productId || productId.length > 64) return errorResponse(400, "invalid_request", "Add ?productId=.");

  waitUntil(
    runClaimedProduct(productId).catch((err) => {
      console.error(`[monitor] worker for ${productId} failed`, err);
    }),
  );
  return json({ ok: true, productId }, 202);
});
