/**
 * The public website-widget endpoints (`POST /api/ingest`, `GET
 * /api/ingest/config`). Built as handler factories with explicit
 * dependencies so they can be tested without a database.
 */
import { z } from "zod";
import { HttpError, corsHeaders, describeZodError } from "@/lib/auth/http";
import { DEFAULT_WIDGET_SETTINGS, type PlanId, type Product } from "@/lib/db/schema";
import { MAX_FEEDBACK_TEXT, MIN_FEEDBACK_TEXT, isLinkSpam } from "./prepare";
import type { IngestArgs, IngestResult } from "./ingest";
import { isUnlimited, limitFor } from "@/lib/plans";

export const DEMO_KEY = "demo";
export const INGEST_MAX_BYTES = 16 * 1024;
const META_MAX_BYTES = 2 * 1024;
/** Per visitor IP per product. */
export const IP_LIMIT = { limit: 10, windowSec: 600 };
/** Per product, all visitors. */
export const PRODUCT_LIMIT = { limit: 300, windowSec: 3600 };

/**
 * Widget messages a product can store per day. The public key is in the page
 * source, so the widget gets its own allowance (about 40% of the monthly
 * feedback quota spread over 30 days): a flood through the widget can never
 * use up the quota that monitored sources need.
 */
export function widgetDailyCap(plan: PlanId): number {
  const monthly = limitFor(plan, "feedback_items_per_month");
  if (isUnlimited(monthly)) return 2_000;
  return Math.max(10, Math.ceil((monthly * 0.4) / 30));
}

export const widgetBodySchema = z.object({
  key: z.string().trim().min(1).max(64),
  text: z
    .string()
    .transform((t) => t.trim())
    .pipe(
      z
        .string()
        .min(MIN_FEEDBACK_TEXT, "Write a few words so the team knows what to look at.")
        .max(MAX_FEEDBACK_TEXT, `Keep it under ${MAX_FEEDBACK_TEXT} characters.`),
    ),
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email("That email address does not look right.").nullable()),
  name: z.string().trim().max(100).optional().nullable(),
  pageUrl: z.string().trim().max(2000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  meta: z
    .record(z.unknown())
    .optional()
    .nullable()
    .refine((m) => !m || JSON.stringify(m).length <= META_MAX_BYTES, "meta must be at most 2 KB of JSON."),
  /** Honeypot: hidden in the widget, must stay empty. */
  website: z.string().max(500).optional().nullable(),
});

export type WidgetBody = z.infer<typeof widgetBodySchema>;

export interface WidgetConfig {
  productName: string;
  prompt: string;
  askEmail: boolean;
  accent: string | null;
  position: "bottom-right" | "bottom-left";
  buttonLabel: string;
  showBranding: boolean;
}

export const DEMO_CONFIG: WidgetConfig = {
  productName: "Example product",
  prompt: DEFAULT_WIDGET_SETTINGS.prompt,
  askEmail: DEFAULT_WIDGET_SETTINGS.askEmail,
  accent: null,
  position: DEFAULT_WIDGET_SETTINGS.position,
  buttonLabel: DEFAULT_WIDGET_SETTINGS.buttonLabel,
  showBranding: true,
};

function normalizeOrigin(o: string): string {
  return o.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * True when the request origin may post for this product. An empty allow-list
 * allows every origin. Entries may use a leading wildcard subdomain:
 * "https://*.acme.com" matches "https://app.acme.com" (not "https://acme.com").
 */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!origin || origin === "null") return false;
  const o = normalizeOrigin(origin);
  return allowed.some((entry) => {
    const e = normalizeOrigin(entry);
    if (e === o) return true;
    const wild = e.match(/^(https?:\/\/)\*\.(.+)$/);
    if (wild) {
      const [, scheme, rest] = wild;
      return o.startsWith(scheme) && o.slice(scheme.length).endsWith(`.${rest}`);
    }
    return false;
  });
}

export interface WidgetDeps {
  isConfigured(): boolean;
  findProductByKey(key: string): Promise<Product | null>;
  rateLimit(key: string, opts: { limit: number; windowSec: number }): Promise<{ ok: boolean; remaining: number; resetAt: Date }>;
  clientIp(req: Request): string;
  ingest(args: IngestArgs): Promise<IngestResult>;
  planFor(workspaceId: string): Promise<PlanId>;
  hasUnbranded(plan: PlanId): boolean;
}

function respond(origin: string | null, status: number, body: unknown, extra?: Record<string, string>): Response {
  const headers = new Headers({
    ...corsHeaders(origin, { methods: "POST, OPTIONS", headers: "Content-Type" }),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(extra ?? {}),
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function errorBody(code: string, error: string, extra?: Record<string, unknown>) {
  return { ...(extra ?? {}), error, code };
}

async function readBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > INGEST_MAX_BYTES) {
    throw new HttpError(413, "payload_too_large", "That feedback is too long to send.");
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > INGEST_MAX_BYTES) {
    throw new HttpError(413, "payload_too_large", "That feedback is too long to send.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_request", "The request body is not valid JSON.");
  }
}

export function preflight(req: Request): Response {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, { methods: "POST, OPTIONS", headers: "Content-Type" }),
  });
}

/** POST /api/ingest */
export function createIngestHandler(deps: WidgetDeps) {
  return async function POST(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    try {
      const parsed = widgetBodySchema.safeParse(await readBody(req));
      if (!parsed.success) {
        return respond(origin, 400, errorBody("invalid_request", describeZodError(parsed.error)));
      }
      const body = parsed.data;

      if (body.key === DEMO_KEY) {
        return respond(origin, 201, { ok: true, demo: true });
      }
      // Bots fill every field; people never see this one. Pretend it worked.
      if (body.website && body.website.trim().length > 0) {
        return respond(origin, 201, { ok: true });
      }
      if (!deps.isConfigured()) {
        return respond(origin, 503, errorBody("not_configured", "Feedback collection is not set up on this deployment yet."));
      }

      const product = await deps.findProductByKey(body.key);
      if (!product) {
        return respond(origin, 404, errorBody("not_found", "This feedback widget is not connected to a product. Check the data-key in the snippet."));
      }
      if (!originAllowed(origin, product.allowedOrigins ?? [])) {
        return respond(origin, 403, errorBody("unsupported_origin", "This website is not allowed to send feedback for this product."));
      }

      const ip = deps.clientIp(req);
      const perIp = await deps.rateLimit(`ingest:ip:${product.id}:${ip}`, IP_LIMIT);
      const perProduct = perIp.ok ? await deps.rateLimit(`ingest:product:${product.id}`, PRODUCT_LIMIT) : perIp;
      if (!perIp.ok || !perProduct.ok) {
        const hit = !perIp.ok ? perIp : perProduct;
        const retryAfter = Math.max(0, Math.ceil((hit.resetAt.getTime() - Date.now()) / 1000));
        return respond(
          origin,
          429,
          errorBody("rate_limited", "Too much feedback from here in a short time. Try again in a few minutes.", { retryAfter }),
          { "Retry-After": String(retryAfter) },
        );
      }

      const plan = await deps.planFor(product.workspaceId);
      const perDay = await deps.rateLimit(`ingest:product-day:${product.id}`, {
        limit: widgetDailyCap(plan),
        windowSec: 86_400,
      });
      if (!perDay.ok) {
        // Over today's widget allowance: the visitor still sees success; nothing is stored.
        return respond(origin, 202, { ok: true, stored: false });
      }

      const spam = isLinkSpam(body.text);
      const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
      const result = await deps.ingest({
        workspaceId: product.workspaceId,
        productId: product.id,
        channel: "widget",
        // Link spam is kept for review but never uses the monthly quota.
        enforceQuota: !spam,
        items: [
          {
            text: body.text,
            author: body.name ?? null,
            authorEmail: body.email,
            rating: body.rating ?? null,
            url: body.pageUrl ?? null,
            sourceKind: "widget",
            status: spam ? "spam" : "new",
            meta: {
              ...(body.meta ?? {}),
              site: "widget",
              pageUrl: body.pageUrl ?? null,
              origin,
              userAgent,
            },
          },
        ],
      });

      if (result.rejected > 0) {
        return respond(origin, 400, errorBody("invalid_request", "Write a few words so the team knows what to look at."));
      }
      if (result.quotaExceeded && result.inserted === 0 && result.duplicates === 0) {
        // The visitor still sees success; the owner sees a quota banner in the inbox.
        return respond(origin, 202, { ok: true, stored: false });
      }
      return respond(origin, 201, { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return respond(origin, err.status, errorBody(err.code, err.message, err.extra));
      }
      console.error("[ingest] failed", err);
      return respond(origin, 500, errorBody("internal", "Something went wrong on our side. Try again in a moment."));
    }
  };
}

/** GET /api/ingest/config?key= */
export function createConfigHandler(deps: Pick<WidgetDeps, "isConfigured" | "findProductByKey" | "planFor" | "hasUnbranded">) {
  return async function GET(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const headers = {
      ...corsHeaders(origin, { allowOrigin: "*", methods: "GET, OPTIONS", headers: "Content-Type" }),
      "Content-Type": "application/json; charset=utf-8",
    };
    const key = new URL(req.url).searchParams.get("key")?.trim() ?? "";
    if (!key || key.length > 64) {
      return new Response(JSON.stringify(errorBody("invalid_request", "Add the product key as ?key=.")), { status: 400, headers });
    }
    if (key === DEMO_KEY) {
      return new Response(JSON.stringify(DEMO_CONFIG), { status: 200, headers: { ...headers, "Cache-Control": "public, max-age=3600" } });
    }
    try {
      if (!deps.isConfigured()) {
        return new Response(JSON.stringify(errorBody("not_configured", "Feedback collection is not set up on this deployment yet.")), {
          status: 503,
          headers,
        });
      }
      const product = await deps.findProductByKey(key);
      if (!product) {
        return new Response(JSON.stringify(errorBody("not_found", "This feedback widget is not connected to a product.")), {
          status: 404,
          headers,
        });
      }
      const plan = await deps.planFor(product.workspaceId);
      const s = { ...DEFAULT_WIDGET_SETTINGS, ...(product.widgetSettings ?? {}) };
      const config: WidgetConfig = {
        productName: product.name,
        prompt: s.prompt || DEFAULT_WIDGET_SETTINGS.prompt,
        askEmail: s.askEmail,
        accent: s.accent && /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : null,
        position: s.position === "bottom-left" ? "bottom-left" : "bottom-right",
        buttonLabel: s.buttonLabel || DEFAULT_WIDGET_SETTINGS.buttonLabel,
        showBranding: !deps.hasUnbranded(plan),
      };
      return new Response(JSON.stringify(config), {
        status: 200,
        headers: { ...headers, "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
      });
    } catch (err) {
      console.error("[ingest/config] failed", err);
      return new Response(JSON.stringify(errorBody("internal", "Something went wrong on our side.")), { status: 500, headers });
    }
  };
}
