import { HttpError, json, withRoute } from "@/lib/auth/http";
import { requireRole, requireUser } from "@/lib/auth/session";
import { isValidSlackWebhook, postSlackMessage } from "@/lib/alerts";
import { toIntegrationDTO } from "@/lib/db/dto";
import { makeDeleteHandler } from "../_lib/handlers";
import { slackSchema } from "../_lib/rules";
import { assertIntegrationFeature, saveIntegration, upstreamMessage } from "../_lib/service";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saves the Slack incoming webhook after a successful test post. */
export const PUT = withRoute(async (req) => {
  const ctx = await requireUser();
  requireRole(ctx, "admin");
  await assertIntegrationFeature(ctx, "slack");
  const body = await parseBody(req, slackSchema);

  if (!isValidSlackWebhook(body.webhookUrl)) {
    throw new HttpError(
      400,
      "invalid_request",
      "That is not a Slack incoming webhook URL. It starts with https://hooks.slack.com/services/.",
    );
  }

  try {
    await postSlackMessage(body.webhookUrl, {
      text: `BuildMonday is connected. Alerts for ${ctx.workspace.name} will post here.`,
    });
  } catch (err) {
    throw new HttpError(
      502,
      "upstream_failed",
      `That Slack URL did not accept our test message. Check the webhook is still active in Slack. (${upstreamMessage(err, "No response")})`,
    );
  }

  const row = await saveIntegration(
    ctx.workspace.id,
    "slack",
    { kind: "slack", channelName: body.channelName ?? null, auth: "webhook" },
    body.webhookUrl,
  );
  return json({ integration: toIntegrationDTO(row) });
});

export const DELETE = makeDeleteHandler("slack");
