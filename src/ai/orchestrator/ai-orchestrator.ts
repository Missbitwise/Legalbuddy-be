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

    const totalStart = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestStart = Date.now();

      try {
        logger.info(
          {
            attempt,
            model: MODEL,
            promptLength: prompt.length,
          },
          "Sending request to Gemini"
        );

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

        const requestTime = Date.now() - requestStart;
        const totalTime = Date.now() - totalStart;

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!text) {
          throw new Error("Gemini returned an empty response");
        }

        logger.info(
          {
            attempt,
            requestTimeMs: requestTime,
            totalTimeMs: totalTime,
          },
          "Gemini response received"
        );

        return {
          content: text,
        };
      } catch (error: any) {
        const requestTime = Date.now() - requestStart;
        const totalTime = Date.now() - totalStart;

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
            requestTimeMs: requestTime,
            totalTimeMs: totalTime,
          },
          "Gemini request failed"
        );

        // --------------------------------------------------
        // 429 = quota/rate limit
        // Don't blindly retry quota exhaustion.
        // --------------------------------------------------
        if (status === 429) {
          throw new Error(
            "Gemini API quota exceeded. Please wait for the quota to reset."
          );
        }

        // --------------------------------------------------
        // 503 / 500 = temporary server problem
        // Retry with a short delay.
        // --------------------------------------------------
        if (
          (status === 503 || status === 500) &&
          attempt < maxAttempts
        ) {
          const delay = attempt === 1 ? 1000 : 3000;

          logger.warn(
            {
              status,
              attempt,
              retryAfterMs: delay,
            },
            "Gemini temporary error — retrying"
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