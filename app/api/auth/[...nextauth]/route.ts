import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { errorResponse } from "@/lib/auth/http";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth.js handlers. On a deployment without AUTH_SECRET, Auth.js cannot run;
 * answer the read-only endpoints as "signed out" so public pages (the
 * analyzer header, for one) keep working, and refuse everything else clearly.
 */
function notConfigured(req: NextRequest): Response {
  const path = req.nextUrl.pathname;
  if (req.method === "GET" && path.endsWith("/session")) return Response.json(null);
  if (req.method === "GET" && path.endsWith("/providers")) return Response.json({});
  return errorResponse(503, "not_configured", "Sign-in is not set up on this deployment yet.");
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!env.AUTH_SECRET) return notConfigured(req);
  return handlers.GET(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!env.AUTH_SECRET) return notConfigured(req);
  return handlers.POST(req);
}
