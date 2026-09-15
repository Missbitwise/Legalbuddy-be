import axios from "axios";
import logger from "../../common/logger";

export interface AIResponse {
  content: string;
  metadata?: any;
}

export class AIOrchestrator {
  private apiKey: string;
  private model = "gemini-1.5-flash";
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";

    if (!this.apiKey) {
      logger.warn("GEMINI_API_KEY is not defined.");
    }
  }

  async generateResponse(prompt: string): Promise<AIResponse> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

        const response = await axios.post(
          url,
          {
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
          }
        );

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return { content: text };
      } catch (error: any) {
        const status = error?.response?.status;
        const isLastAttempt = attempt === 2;

        logger.error(
          { error: { status, message: error?.response?.data?.error?.message || error?.message }, attempt },
          "Gemini request failed"
        );

        if (status === 503 && !isLastAttempt) {
          logger.warn("Gemini 503 — retrying in 2s...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        throw new Error(
          `Gemini API error ${status}: ${error?.response?.data?.error?.message || error?.message}`
        );
      }
    }

    throw new Error("Failed to generate AI response");
  }
}

export const aiOrchestrator = new AIOrchestrator();
