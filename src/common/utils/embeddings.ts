import { GoogleGenAI } from "@google/genai";
import logger from "../logger";

class EmbeddingService {
  private genAI: GoogleGenAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      logger.warn("GEMINI_API_KEY is not defined.");
    }

    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }

  async generate(text: string): Promise<number[]> {
    try {
      const result = await this.genAI.models.embedContent({
        model: "text-embedding-004",
        contents: text,
      });

      return result.embeddings?.[0]?.values || [];
    } catch (error) {
      logger.error({ error }, "Failed to generate embedding");
      throw new Error("Failed to generate embedding");
    }
  }
}

export const embeddingService = new EmbeddingService();
