import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_ID = "gemini-2.5-flash";

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

function safeParse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return JSON.parse(stripFences(text)) as T;
  }
}

export async function callGeminiJson<T>(prompt: string): Promise<T> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return safeParse<T>(text);
}

export async function callGeminiChat(
  systemInstruction: string,
  history: Array<{ role: "user" | "model"; content: string }>,
  userMessage: string
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction,
    generationConfig: { temperature: 0.6 },
  });
  const chat = model.startChat({
    history: history.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}
