import axios from "axios";
import logger from "../../common/logger";

export interface AIResponse {
  content: string;
  metadata?: any;
}

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

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
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

        if (!text) {
          throw new Error("Gemini returned an empty response");
        }

        return {
          content: text,
        };
      } catch (error: any) {
        const status = error?.response?.status;
        const message =
          error?.response?.data?.error?.message ||
          error?.message ||
          "Unknown Gemini error";

        logger.error(
          {
            error: {
              status,
              name: error?.name,
              message,
            },
            attempt,
          },
          "Gemini request failed"
        );

        // Retry temporary Gemini server/load errors
        if (
          (status === 503 || status === 500 || status === 429) &&
          attempt < maxAttempts
        ) {
          const delay = attempt === 1 ? 2000 : 5000;

          logger.warn(
            `Gemini ${status} — retrying in ${delay / 1000}s...`
          );

          await new Promise((resolve) =>
            setTimeout(resolve, delay)
          );

          continue;
        }

        throw new Error("Failed to generate AI response");
      }
    }

    throw new Error("Failed to generate AI response");
  }
}

export const aiOrchestrator = new AIOrchestrator();