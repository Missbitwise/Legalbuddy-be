import axios from "axios";
import logger from "../../common/logger";

export interface AIResponse {
  content: string;
  metadata?: any;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-1.5-flash";

function getAuthHeaders() {
  const key = process.env.GEMINI_API_KEY?.trim() || "";
  // AQ. tokens are OAuth access tokens — must go in Authorization header
  // AIza... tokens are API keys — sent as ?key= query param
  if (key.startsWith("AQ.") || key.startsWith("ya29.")) {
    return { headers: { Authorization: `Bearer ${key}` }, params: {} };
  }
  return { headers: {}, params: { key } };
}

export class AIOrchestrator {
  async generateResponse(prompt: string): Promise<AIResponse> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { headers, params } = getAuthHeaders();
        const response = await axios.post(
          `${GEMINI_BASE}/models/${MODEL}:generateContent`,
          {
            contents: [{ parts: [{ text: prompt }] }],
          },
          { headers, params, timeout: 60000 }
        );

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return { content: text };
      } catch (error: any) {
        const status = error?.response?.status;
        const isLastAttempt = attempt === 2;

        logger.error({ error: { status, name: error?.name }, attempt }, "Gemini request failed");

        if (status === 503 && !isLastAttempt) {
          logger.warn("Gemini 503 — retrying in 2s...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        throw new Error("Failed to generate AI response");
      }
    }
    throw new Error("Failed to generate AI response");
  }
}

export const aiOrchestrator = new AIOrchestrator();
