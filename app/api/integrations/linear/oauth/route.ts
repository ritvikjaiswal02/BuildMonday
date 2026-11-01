import { linearAuthorizeUrl } from "@/lib/oauth/providers";
import { startOAuth } from "../../_lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts "Connect Linear" (OAuth, actor=application). */
export function GET(req: Request) {
  return startOAuth(req, "linear", linearAuthorizeUrl);
}
