/** Request schema for POST /api/onboarding. Pure. */
import { z } from "zod";
import { ALERT_MODES } from "@/lib/db/schema";
import { isValidTimezone } from "@/components/onboarding/model";
import { descriptionSchema, productNameSchema, websiteSchema } from "@/app/api/products/_lib/rules";
import { sourceConfigSchema, sourceKindSchema, sourceRoleSchema } from "@/app/api/sources/_lib/schemas";

export const MAX_ONBOARDING_SOURCES = 40;

export const onboardingSchema = z.object({
  product: z.object({
    name: productNameSchema,
    websiteUrl: websiteSchema.optional(),
    description: descriptionSchema.optional(),
  }),
  sources: z
    .array(
      z.object({
        kind: sourceKindSchema,
        config: sourceConfigSchema,
        role: sourceRoleSchema.default("own"),
        competitorName: z.string().max(120).nullish(),
      }),
    )
    .max(MAX_ONBOARDING_SOURCES, `Add at most ${MAX_ONBOARDING_SOURCES} sources at once.`)
    .default([]),
  team: z.object({
    // Older clients still send role and size; they are kept when present.
    role: z.enum(["founder", "pm", "engineer", "designer", "support", "other"]).optional(),
    size: z.enum(["1", "2-5", "6-20", "21-50", "50+"]).optional(),
    tracker: z.enum(["linear", "github", "jira", "other"]),
    usesSlack: z.boolean(),
  }),
  autofile: z
    .object({
      target: z.enum(["linear", "github"]),
      enabled: z.boolean(),
      threshold: z.number().int().min(0).max(100),
    })
    .optional(),
  notifications: z.object({
    digest: z.boolean(),
    alerts: z.enum(ALERT_MODES),
    timezone: z
      .string()
      .max(64)
      .transform((tz) => (isValidTimezone(tz) ? tz : "UTC")),
  }),
});

export type OnboardingBody = z.infer<typeof onboardingSchema>;
