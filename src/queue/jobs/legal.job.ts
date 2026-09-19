import { Job } from "bullmq";
import { PDFParse } from "pdf-parse";
import logger from "../../common/logger";
import { EmbeddingError, embeddingService, MAX_EMBEDDING_BATCH_SIZE } from "../../common/utils/embeddings";
import { createLegalChunks } from "../../common/utils/legal-chunking";
import prisma from "../../config/prisma";
import { v4 as uuidv4 } from "uuid";

export interface LegalJobData {
  documentId: string;
  fileBase64: string;
  title: string;
}

export const processLegalDocument = async (
  job: Job<LegalJobData>,
) => {
  const { documentId, fileBase64, title } = job.data;

  let parser: PDFParse | undefined;
  try {
    logger.info(
      { documentId, jobId: job.id },
      "Starting PDF processing",
    );

    // Convert Base64 back into PDF Buffer
    const fileBuffer = Buffer.from(fileBase64, "base64");

    // Parse the PDF
    parser = new PDFParse({
      data: fileBuffer,
    });

    const textResult = await parser.getText();

    const content = textResult.text;

    if (!content || content.trim().length === 0) {
      throw new Error("Could not extract text from PDF");
    }

    const chunks = createLegalChunks(textResult.pages);
    if (!chunks.length) throw new Error("No usable legal provisions were found in PDF");

    // A retried job resumes after an embedding rate limit instead of duplicating existing chunks.
    const existingChunks = await prisma.$queryRaw<Array<{ chunkIndex: string }>>`
      SELECT "metadata" ->> 'chunkIndex' AS "chunkIndex"
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId} AND "metadata" ->> 'chunkIndex' IS NOT NULL`;
    const storedIndices = new Set(existingChunks.map((row) => Number(row.chunkIndex)).filter(Number.isInteger));

    let stored = storedIndices.size;
    const failedChunks: number[] = [];
    const pendingChunks = chunks
      .map((chunk, index) => ({ chunk, index }))
      .filter(({ index }) => !storedIndices.has(index));

    for (let offset = 0; offset < pendingChunks.length; offset += MAX_EMBEDDING_BATCH_SIZE) {
      const batch = pendingChunks.slice(offset, offset + MAX_EMBEDDING_BATCH_SIZE);
      try {
        const embeddings = await embeddingService.generateBatch(
          batch.map(({ chunk }) => chunk.content),
          "search_document",
        );
        for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
          const { chunk, index } = batch[batchIndex];
          const embedding = embeddings[batchIndex];
          if (!embedding?.length) throw new Error("Empty embedding returned");
          const embeddingVector = `[${embedding.join(",")}]`;
          await prisma.$executeRaw`
            INSERT INTO "DocumentChunk" (
              "id", "documentId", "sectionHeader", "sectionNumber", "chapter", "pageNumber", "content", "metadata", "embedding"
            ) VALUES (
              ${uuidv4()}, ${documentId}, ${chunk.sectionHeader ?? null}, ${chunk.sectionNumber ?? null},
              ${chunk.chapter ?? null}, ${chunk.pageNumber ?? null}, ${chunk.content},
              ${JSON.stringify({ extraction: "pdf-parse", chunkIndex: index, embeddingProvider: "cohere", embeddingModel: "embed-v4.0" })}::jsonb, ${embeddingVector}::vector
            )`;
          stored++;
        }
      } catch (error) {
        // Never mark a document as successfully indexed when its embedding provider failed.
        // Queue retry/backoff handles transient Cohere failures; configuration errors remain visible.
        if (error instanceof EmbeddingError) {
          throw error;
        }
        failedChunks.push(...batch.map(({ index }) => index));
        logger.warn({ error, documentId, chunkIndexes: batch.map(({ index }) => index) }, "Skipping chunks that could not be stored");
      }
    }
    if (!stored) throw new Error("No chunks could be embedded and stored");

    logger.info(
      {
        documentId,
        title,
        textLength: content.length,
        pages: textResult.pages.length,
        chunksCreated: chunks.length,
        chunksStored: stored,
        chunksResumed: storedIndices.size,
        failedChunks,
      },
      "PDF processed and chunks stored successfully",
    );
  } catch (error) {
    logger.error(
      {
        error: {
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : String(error),
          status: error instanceof EmbeddingError ? error.status : undefined,
        },
        documentId,
      },
      "Failed to process legal document",
    );

    throw error;
  } finally {
    await parser?.destroy().catch((error) => logger.warn({ error, documentId }, "Failed to clean up PDF parser"));
  }
};
