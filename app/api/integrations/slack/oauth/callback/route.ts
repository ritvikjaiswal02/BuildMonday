import { postSlackMessage } from "@/lib/alerts";
import { exchangeSlackCode } from "@/lib/oauth/providers";
import { finishOAuth } from "../../../_lib/oauth";
import { normalizeChannelName } from "../../../_lib/rules";
import { saveIntegration } from "../../../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Slack sends the browser here with `code`; the incoming webhook it returns becomes the integration. */
export function GET(req: Request) {
  return finishOAuth(req, "slack", async (ctx, params) => {
    const code = params.get("code");
    if (!code) throw new Error("Slack did not send a code back. Try connecting again.");
    const { webhookUrl, channelName } = await exchangeSlackCode(code);
    try {
      await postSlackMessage(webhookUrl, {
        text: `BuildMonday is connected. Alerts for ${ctx.workspace.name} will post here.`,
      });
    } catch {
      throw new Error("Slack connected, but our test message did not go through. Try connecting again.");
    }
    await saveIntegration(
      ctx.workspace.id,
      "slack",
      { kind: "slack", channelName: normalizeChannelName(channelName), auth: "oauth" },
      webhookUrl,
    );
  });
}
