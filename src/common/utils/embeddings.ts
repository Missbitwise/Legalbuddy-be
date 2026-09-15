import axios from "axios";
import logger from "../logger";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_MODEL = "text-embedding-004";

function getAuthHeaders() {
  const key = process.env.GEMINI_API_KEY?.trim() || "";
  if (key.startsWith("AQ.") || key.startsWith("ya29.")) {
    return { headers: { Authorization: `Bearer ${key}` }, params: {} };
  }
  return { headers: {}, params: { key } };
}

class EmbeddingService {
  async generate(text: string): Promise<number[]> {
    try {
      const { headers, params } = getAuthHeaders();
      const response = await axios.post(
        `${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent`,
        {
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
        },
        { headers, params, timeout: 30000 }
      );

      return response.data?.embedding?.values || [];
    } catch (error: any) {
      logger.error({ error: { status: error?.response?.status, name: error?.name } }, "Failed to generate embedding");
      throw new Error("Failed to generate embedding");
    }
  }
}

export const embeddingService = new EmbeddingService();
