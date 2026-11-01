import { createIngestHandler, preflight } from "@/lib/feedback/widget";
import { widgetDeps } from "@/lib/feedback/widget-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public endpoint for the website widget (public/widget.js). */
export const POST = createIngestHandler(widgetDeps);

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
