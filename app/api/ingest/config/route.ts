import { corsHeaders } from "@/lib/auth/http";
import { createConfigHandler } from "@/lib/feedback/widget";
import { widgetDeps } from "@/lib/feedback/widget-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public widget configuration for a product key (label, prompt, position, branding). */
export const GET = createConfigHandler(widgetDeps);

export function OPTIONS(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin"), { allowOrigin: "*", methods: "GET, OPTIONS", headers: "Content-Type" }),
  });
}
