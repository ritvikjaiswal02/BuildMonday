/** Request schemas shared by the sources routes and onboarding. Pure. */
import { z } from "zod";
import { MONITOR_SOURCE_KINDS, SOURCE_ROLES } from "@/lib/db/schema";

export const sourceKindSchema = z.enum(MONITOR_SOURCE_KINDS);
export const sourceRoleSchema = z.enum(SOURCE_ROLES);

/** The config is validated per kind by lib/sources `validateSourceConfig`; here it only has to be an object. */
export const sourceConfigSchema = z.record(z.unknown());

const competitorNameSchema = z
  .string()
  .max(120)
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim().replace(/\s+/g, " ");
    return t ? t.slice(0, 60) : null;
  });

/** `{ kind, config }` or `{ url }`, used by POST /api/sources/test. */
export const sourceLocatorSchema = z.union([
  z.object({ kind: sourceKindSchema, config: sourceConfigSchema }).strict(),
  z.object({ url: z.string().trim().min(1, "Paste a link.").max(2048) }).strict(),
]);

export type SourceLocator = z.infer<typeof sourceLocatorSchema>;

export const createSourceSchema = z.union([
  z
    .object({
      productId: z.string().min(1).max(64),
      kind: sourceKindSchema,
      config: sourceConfigSchema,
      role: sourceRoleSchema.optional(),
      competitorName: competitorNameSchema,
    })
    .strict(),
  z
    .object({
      productId: z.string().min(1).max(64),
      url: z.string().trim().min(1, "Paste a link.").max(2048),
      role: sourceRoleSchema.optional(),
      competitorName: competitorNameSchema,
    })
    .strict(),
]);

export type CreateSourceBody = z.infer<typeof createSourceSchema>;

export const updateSourceSchema = z
  .object({
    config: sourceConfigSchema.optional(),
    enabled: z.boolean().optional(),
    label: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(1, "Add a label.").max(80, "Keep the label under 80 characters."))
      .optional(),
  })
  .strict()
  .refine((v) => v.config !== undefined || v.enabled !== undefined || v.label !== undefined, {
    message: "Nothing to update.",
  });

export type UpdateSourceBody = z.infer<typeof updateSourceSchema>;
