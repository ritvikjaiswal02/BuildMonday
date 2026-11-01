import type { z } from "zod";
import { parseJson } from "@/lib/auth/http";

/** `parseJson` typed by the schema's parsed output (schemas here use transforms). */
export function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
  opts?: { maxBytes?: number },
): Promise<z.output<S>> {
  return parseJson(req, schema as unknown as z.ZodType<z.output<S>>, opts);
}
