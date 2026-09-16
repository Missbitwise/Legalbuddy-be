import axios from "axios";
import logger from "../../common/logger";

export interface AIResponse {
  content: string;
  metadata?: any;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Current stable Gemini model
const MODEL = "gemini-3.6-flash";

function getAuthHeaders() {
  const key = process.env.GEMINI_API_KEY?.trim() || "";

  return {
    "x-goog-api-key": key,
    "Content-Type": "application/json",
  };
}

export class AIOrchestrator {
  async generateResponse(prompt: string): Promise<AIResponse> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const headers = getAuthHeaders();

        const response = await axios.post(
          `${GEMINI_BASE}/models/${MODEL}:generateContent`,
          {
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          },
          {
            headers,
            timeout: 60000,
          }
        );

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return {
          content: text,
        };
      } catch (error: any) {
        const status = error?.response?.status;

        const isLastAttempt = attempt === 2;

        logger.error(
          {
            error: {
              status,
              name: error?.name,
              message: error?.response?.data?.error?.message,
            },
            attempt,
          },
          "Gemini request failed"
        );

        if (status === 503 && !isLastAttempt) {
          logger.warn("Gemini 503 — retrying in 2s...");

          await new Promise((resolve) => setTimeout(resolve, 2000));

          continue;
        }

        throw new Error("Failed to generate AI response");
      }
    }

    throw new Error("Failed to generate AI response");
  }
}

export const aiOrchestrator = new AIOrchestrator();