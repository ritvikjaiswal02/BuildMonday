/**
 * Pure validation for product create/update: zod schemas, website and origin
 * normalisation and widget settings merging. No database access.
 */
import { z } from "zod";
import { DEFAULT_WIDGET_SETTINGS, type WidgetSettings } from "@/lib/db/schema";

/** "acme.com" -> "https://acme.com"; returns null for empty input. */
export function normalizeWebsiteUrl(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export const websiteSchema = z
  .string()
  .max(2048)
  .nullish()
  .transform((v) => normalizeWebsiteUrl(v))
  .refine((v) => v === null || isHttpUrl(v), { message: "Enter a full web address, like https://acme.com." });

export const productNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Enter a product name.").max(60, "Keep the name under 60 characters."));

export const descriptionSchema = z
  .string()
  .max(1000)
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t ? t : null;
  })
  .refine((v) => v === null || v.length <= 280, { message: "Keep the description under 280 characters." });

export const createProductSchema = z.object({
  name: productNameSchema,
  websiteUrl: websiteSchema.optional(),
  description: descriptionSchema.optional(),
});

/**
 * Normalises one allowed origin: "https://acme.com/path" -> "https://acme.com",
 * "acme.com" -> "https://acme.com", "http://localhost:3000" stays. Returns null if invalid.
 */
export function normalizeOrigin(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || /\s/.test(url.hostname)) return null;
  const isLocal = url.hostname === "localhost" || /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (!isLocal && !url.hostname.includes(".")) return null;
  return url.origin.toLowerCase();
}

export const allowedOriginsSchema = z
  .array(z.string().max(300))
  .max(10, "Add at most 10 allowed sites.")
  .transform((list, ctx) => {
    const out: string[] = [];
    for (const raw of list) {
      if (!raw.trim()) continue;
      const origin = normalizeOrigin(raw);
      if (!origin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${raw.trim()}" is not a website address.` });
        return z.NEVER;
      }
      if (!out.includes(origin)) out.push(origin);
    }
    return out;
  });

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const widgetSettingsPatchSchema = z
  .object({
    position: z.enum(["bottom-right", "bottom-left"]),
    prompt: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().min(1, "Add a prompt for the widget.").max(120, "Keep the prompt under 120 characters.")),
    askEmail: z.boolean(),
    accent: z
      .string()
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
      .refine((v) => v === null || HEX_COLOR.test(v), { message: "Use a hex colour like #2340d9." }),
    buttonLabel: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().min(1, "Add a button label.").max(24, "Keep the button label under 24 characters.")),
  })
  .partial()
  .strict();

export type WidgetSettingsPatch = z.infer<typeof widgetSettingsPatchSchema>;

export function mergeWidgetSettings(current: WidgetSettings | null | undefined, patch: WidgetSettingsPatch): WidgetSettings {
  const base: WidgetSettings = { ...DEFAULT_WIDGET_SETTINGS, ...(current ?? {}) };
  const next: WidgetSettings = { ...base };
  if (patch.position !== undefined) next.position = patch.position;
  if (patch.prompt !== undefined) next.prompt = patch.prompt;
  if (patch.askEmail !== undefined) next.askEmail = patch.askEmail;
  if (patch.accent !== undefined) next.accent = patch.accent;
  if (patch.buttonLabel !== undefined) next.buttonLabel = patch.buttonLabel;
  return next;
}

export const productPatchSchema = z
  .object({
    name: productNameSchema,
    websiteUrl: websiteSchema,
    description: descriptionSchema,
    monitoringEnabled: z.boolean(),
    alertThreshold: z.number().int().min(0).max(100),
    autofileEnabled: z.boolean(),
    autofileTarget: z.enum(["linear", "github"]).nullable(),
    autofileThreshold: z.number().int().min(50).max(100),
    widgetSettings: widgetSettingsPatchSchema,
    allowedOrigins: allowedOriginsSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export type ProductPatch = z.infer<typeof productPatchSchema>;
