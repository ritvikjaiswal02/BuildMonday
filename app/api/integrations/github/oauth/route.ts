import { githubInstallUrl } from "@/lib/oauth/providers";
import { startOAuth } from "../../_lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts installing the BuildMonday GitHub App. */
export function GET(req: Request) {
  return startOAuth(req, "github", githubInstallUrl);
}
