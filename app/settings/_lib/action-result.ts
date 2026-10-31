/**
 * Result shape for P2 server actions. Thrown errors lose their message in
 * production builds, so actions catch and return `{ ok: false, error }`; plan
 * gates also return the 402 body so the client can open UpgradeDialog.
 */
import { ZodError } from "zod";
import { HttpError, describeZodError } from "@/lib/auth/http";
import { parsePlanError, type PlanErrorBody } from "@/lib/plans";

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; plan?: PlanErrorBody };

export function actionError(err: unknown): { ok: false; error: string; plan?: PlanErrorBody } {
  if (err instanceof HttpError) {
    const plan =
      err.status === 402 ? parsePlanError({ ...(err.extra ?? {}), error: err.message, code: err.code }) : null;
    return plan ? { ok: false, error: err.message, plan } : { ok: false, error: err.message };
  }
  if (err instanceof ZodError) return { ok: false, error: describeZodError(err) };
  if (isNextControlFlow(err)) throw err;
  console.error("[settings] action failed", err);
  return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
}

function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}
