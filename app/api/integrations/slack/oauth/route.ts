import { slackAuthorizeUrl } from "@/lib/oauth/providers";
import { startOAuth } from "../../_lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts "Add to Slack" (incoming-webhook scope). */
export function GET(req: Request) {
  return startOAuth(req, "slack", slackAuthorizeUrl);
}
