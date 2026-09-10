import { GoogleGenAI } from "@google/genai";
import logger from "../../common/logger";

export interface AIResponse {
  content: string;
  metadata?: any;
}

export class AIOrchestrator {
  private genAI: GoogleGenAI;
  private model = "gemini-3.6-flash";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      logger.warn("GEMINI_API_KEY is not defined.");
    }

    this.genAI = new GoogleGenAI({ apiKey: apiKey || "" });
  }

  async generateResponse(prompt: string): Promise<AIResponse> {
    // Retry once on transient 503 errors
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.genAI.models.generateContent({
          model: this.model,
          contents: prompt,
        });

        return {
          content: result.text || "",
        };
      } catch (error: any) {
        const is503 = error?.status === 503;
        const isLastAttempt = attempt === 2;

        logger.error(
          { error, attempt },
          "Gemini request failed",
        );

        if (is503 && !isLastAttempt) {
          logger.warn("Gemini 503 — retrying in 2s...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        throw new Error("Failed to generate AI response");
      }
    }

    // unreachable, satisfies TS
    throw new Error("Failed to generate AI response");
  }
}

export const aiOrchestrator = new AIOrchestrator();