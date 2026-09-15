import prisma from "../../config/prisma";
import { embeddingService } from "./embeddings";
import logger from "../logger";

class RetrievalService {
  async search(query: string, limit = 5) {
    try {
      const queryEmbedding = await embeddingService.generate(query);

      // If embedding is empty, skip vector search
      if (!queryEmbedding || queryEmbedding.length === 0) {
        logger.warn("Empty embedding returned, skipping vector search");
        return [];
      }

      const vectorString = `[${queryEmbedding.join(",")}]`;

      const results = await prisma.$queryRaw`
        SELECT
          "id",
          "documentId",
          "content",
          "sectionHeader",
          "metadata"
        FROM "DocumentChunk"
        WHERE "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${vectorString}::vector
        LIMIT ${limit};
      `;

      return results;
    } catch (error) {
      logger.error({ error }, "Retrieval search failed, continuing without context");
      return [];
    }
  }
}

export const retrievalService = new RetrievalService();