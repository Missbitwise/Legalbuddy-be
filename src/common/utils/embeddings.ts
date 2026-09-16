import axios from "axios";
import logger from "../logger";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const EMBED_MODEL = "gemini-embedding-2";

// Keep 768 dimensions for compatibility with a typical existing
// vector database setup.
const EMBEDDING_DIMENSIONS = 768;

function getAuthHeaders() {
  const key = process.env.GEMINI_API_KEY?.trim() || "";

  return {
    "x-goog-api-key": key,
    "Content-Type": "application/json",
  };
}

class EmbeddingService {
  async generate(text: string): Promise<number[]> {
    try {
      const headers = getAuthHeaders();

      const response = await axios.post(
        `${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent`,
        {
          content: {
            parts: [
              {
                text,
              },
            ],
          },
          output_dimensionality: EMBEDDING_DIMENSIONS,
        },
        {
          headers,
          timeout: 30000,
        }
      );

      return response.data?.embedding?.values || [];
    } catch (error: any) {
      logger.error(
        {
          error: {
            status: error?.response?.status,
            name: error?.name,
            message: error?.response?.data?.error?.message,
          },
        },
        "Failed to generate embedding"
      );

      throw new Error("Failed to generate embedding");
    }
  }
}

export const embeddingService = new EmbeddingService();