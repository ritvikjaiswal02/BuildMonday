/**
 * CORS for the extension API. Only browser-extension origins get an
 * Access-Control-Allow-Origin header, so a web page that somehow holds a token
 * still cannot read responses. Requests without an Origin (curl, server to
 * server, or an extension with host permissions) are unaffected by CORS.
 */

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-z0-9]{16,64}$/i;

export function isExtensionOrigin(origin: string | null | undefined): origin is string {
  return typeof origin === "string" && EXTENSION_ORIGIN.test(origin);
}

export function extensionCorsHeaders(req: Request, methods = "GET, POST, OPTIONS"): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = { Vary: "Origin" };
  if (isExtensionOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = methods;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

/** Copies the CORS headers onto a response produced elsewhere (including error responses). */
export function withExtensionCors(req: Request, res: Response, methods?: string): Response {
  for (const [key, value] of Object.entries(extensionCorsHeaders(req, methods))) {
    if (key === "Vary") {
      const existing = res.headers.get("Vary");
      if (existing && existing.toLowerCase().includes("origin")) continue;
      res.headers.set("Vary", existing ? `${existing}, Origin` : "Origin");
      continue;
    }
    res.headers.set(key, value);
  }
  return res;
}

/** 204 preflight answer for OPTIONS /api/extension/*. */
export function extensionPreflight(req: Request, methods?: string): Response {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(req, methods) });
}
