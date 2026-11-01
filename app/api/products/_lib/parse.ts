import type { z } from "zod";
import { parseJson } from "@/lib/auth/http";

/**
 * `parseJson` typed by the schema's output. `parseJson<T>(req, z.ZodType<T>)`
 * infers T from the input side for schemas with defaults or transforms, so the
 * P2 routes go through this wrapper to get the parsed (output) type.
 */
export function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
  opts?: { maxBytes?: number },
): Promise<z.output<S>> {
  return parseJson(req, schema as unknown as z.ZodType<z.output<S>>, opts);
}
