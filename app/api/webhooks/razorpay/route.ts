import { errorResponse, json } from "@/lib/auth/http";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { claimEvent, eventIdFor, markProcessed, processEvent, type RazorpayWebhookBody } from "./_lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * POST /api/webhooks/razorpay. Verifies X-Razorpay-Signature over the raw
 * body, dedupes on X-Razorpay-Event-Id and mirrors subscription changes onto
 * the workspace. Answers 200 for events it does not handle so Razorpay stops
 * retrying them; answers 500 when processing failed so Razorpay retries.
 */
export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "The webhook body is too large.");
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return errorResponse(400, "invalid_request", "The webhook body could not be read.");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "The webhook body is too large.");
  }

  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return errorResponse(400, "invalid_request", "The webhook signature is not valid.");
  }

  let body: RazorpayWebhookBody;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { event?: unknown }).event !== "string") {
      return errorResponse(400, "invalid_request", "The webhook body has no event.");
    }
    body = parsed as RazorpayWebhookBody;
  } catch {
    return errorResponse(400, "invalid_request", "The webhook body is not valid JSON.");
  }

  const eventId = eventIdFor(req.headers.get("x-razorpay-event-id"), raw);

  try {
    const claim = await claimEvent({ eventId, type: body.event, payload: body });
    if (claim.state === "duplicate") {
      return json({ received: true, duplicate: true });
    }

    const workspaceId = await processEvent(body);
    await markProcessed(eventId, workspaceId);
    return json({ received: true });
  } catch (err) {
    console.error(`[billing] webhook ${body.event} (${eventId}) failed`, err);
    return errorResponse(500, "internal", "The webhook could not be processed. Razorpay will retry.");
  }
}
