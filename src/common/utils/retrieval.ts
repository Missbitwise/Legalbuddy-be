import prisma from "../../config/prisma";
import { embeddingService } from "./embeddings";

class RetrievalService {
  async search(query: string, limit = 5) {
    const queryEmbedding = await embeddingService.generate(query);

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
  }
}

export const retrievalService = new RetrievalService();