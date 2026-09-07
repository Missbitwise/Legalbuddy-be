import { GoogleGenAI } from "@google/genai";
import logger from "../../common/logger";

export interface AIResponse {
  content: string;
  metadata?: any;
}

export class AIOrchestrator {
  private genAI: GoogleGenAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      logger.warn("GEMINI_API_KEY is not defined.");
    }

    this.genAI = new GoogleGenAI();
  }

  async generateResponse(prompt: string): Promise<AIResponse> {
    try {
      const result = await this.genAI.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

      return {
        content: result.text || "",
      };
    } catch (error) {
      logger.error({ error }, "Gemini request failed");
      throw new Error("Failed to generate AI response");
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();