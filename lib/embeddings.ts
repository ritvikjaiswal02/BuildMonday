import "server-only";

import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { HttpError } from "@/lib/auth/http";
import { env } from "@/lib/env";
import { toModelError } from "@/lib/gemini";

/** Used when the configured embedding model is not available to this key. */
export const FALLBACK_EMBEDDING_MODEL = "text-embedding-004";
/** Small vectors keep stored issue embeddings compact; both models support it. */
export const EMBEDDING_DIMENSIONS = 768;
const BATCH_SIZE = 100;

let resolvedModel: string | null = null;

function getClient(): GoogleGenerativeAI {
  const key = env.GEMINI_API_KEY;
  if (!key) {
    throw new HttpError(503, "not_configured", "Analysis is not set up on this deployment yet (GEMINI_API_KEY is missing).");
  }
  return new GoogleGenerativeAI(key);
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  if (status === 404) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && /\b404\b|not found/i.test(message);
}

async function embedWithModel(client: GoogleGenerativeAI, modelId: string, texts: string[]): Promise<number[][]> {
  const model = client.getGenerativeModel({ model: modelId });
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const res = await model.batchEmbedContents({
      requests: chunk.map((text) => ({
        content: { role: "user", parts: [{ text }] },
        taskType: TaskType.SEMANTIC_SIMILARITY,
        // Passed through to the API as-is; the SDK typings predate this field.
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })) as Parameters<typeof model.batchEmbedContents>[0]["requests"],
    });
    for (const e of res.embeddings) out.push(e.values);
  }
  return out;
}

/**
 * Embeds texts for semantic similarity. Uses GEMINI_EMBEDDING_MODEL and falls
 * back to text-embedding-004 when that model answers 404.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const primary = resolvedModel ?? env.GEMINI_EMBEDDING_MODEL;
  try {
    const vectors = await embedWithModel(client, primary, texts);
    resolvedModel = primary;
    return vectors;
  } catch (err) {
    if (primary !== FALLBACK_EMBEDDING_MODEL && isNotFound(err)) {
      console.warn(`[embeddings] ${primary} is not available, falling back to ${FALLBACK_EMBEDDING_MODEL}`);
      const vectors = await embedWithModel(client, FALLBACK_EMBEDDING_MODEL, texts);
      resolvedModel = FALLBACK_EMBEDDING_MODEL;
      return vectors;
    }
    // Raw SDK errors carry endpoint URLs and model names; never surface them.
    throw toModelError(err);
  }
}

export { compactVector, cosineSimilarity } from "./embeddings-math";
