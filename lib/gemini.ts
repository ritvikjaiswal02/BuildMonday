import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { HttpError } from "@/lib/auth/http";
import { env } from "@/lib/env";

/** True when GEMINI_API_KEY is set. */
export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

function getClient(): GoogleGenerativeAI {
  const key = env.GEMINI_API_KEY;
  if (!key) {
    throw new HttpError(503, "not_configured", "Analysis is not set up on this deployment yet (GEMINI_API_KEY is missing).");
  }
  return new GoogleGenerativeAI(key);
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

/**
 * Parses model output as JSON. Accepts plain JSON, fenced JSON, and JSON with
 * leading or trailing prose (takes the outermost array or object).
 */
export function parseModelJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // fall through
  }
  const unfenced = stripFences(text);
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    // fall through
  }
  const firstArr = unfenced.indexOf("[");
  const firstObj = unfenced.indexOf("{");
  const starts = [firstArr, firstObj].filter((i) => i >= 0);
  if (starts.length > 0) {
    const start = Math.min(...starts);
    const close = unfenced[start] === "[" ? "]" : "}";
    const end = unfenced.lastIndexOf(close);
    if (end > start) {
      return JSON.parse(unfenced.slice(start, end + 1)) as T;
    }
  }
  throw new SyntaxError("The model did not return valid JSON.");
}

/** Turns SDK and network failures into a user-facing HttpError. */
export function toModelError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const status = err && typeof err === "object" ? (err as { status?: unknown }).status : undefined;
  if (status === 429) {
    return new HttpError(503, "upstream_failed", "The analysis service is at capacity right now. Try again in a minute.");
  }
  if (status === 400 || status === 403) {
    console.error("[gemini] request rejected", err);
    return new HttpError(502, "upstream_failed", "The analysis service rejected the request. Check the Gemini API key and model.");
  }
  console.error("[gemini] request failed", err);
  return new HttpError(502, "upstream_failed", "The analysis service did not respond. Try again in a minute.");
}

/**
 * One JSON generation call. Retries once when the model returns malformed
 * JSON (the second attempt runs at a lower temperature).
 */
export async function callGeminiJson<T>(prompt: string, opts?: { temperature?: number }): Promise<T> {
  const client = getClient();
  const temperature = opts?.temperature ?? 0.4;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const model = client.getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: attempt === 0 ? temperature : Math.min(temperature, 0.2),
      },
    });
    let text: string;
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (err) {
      throw toModelError(err);
    }
    try {
      return parseModelJson<T>(text);
    } catch (err) {
      lastError = err;
      console.warn(`[gemini] malformed JSON on attempt ${attempt + 1}`);
    }
  }
  console.warn("[gemini] gave up after malformed JSON", lastError instanceof Error ? lastError.message : lastError);
  throw new HttpError(502, "upstream_failed", "The analysis model returned an unreadable answer. Try again.");
}

export async function callGeminiChat(
  systemInstruction: string,
  history: Array<{ role: "user" | "model"; content: string }>,
  userMessage: string,
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: env.GEMINI_MODEL,
    systemInstruction,
    generationConfig: { temperature: 0.6 },
  });
  const chat = model.startChat({
    history: history.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  });
  try {
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  } catch (err) {
    throw toModelError(err);
  }
}
