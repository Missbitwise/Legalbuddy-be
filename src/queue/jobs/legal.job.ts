import { Job } from "bullmq";
import { PDFParse } from "pdf-parse";
import logger from "../../common/logger";
import { assertEmbeddingDimension, EMBEDDING_DIMENSIONS, EmbeddingError, embeddingService, LOCAL_EMBEDDING_MODEL, MAX_EMBEDDING_BATCH_SIZE } from "../../common/utils/embeddings";
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

    // Fail before writing any chunks if the deployed pgvector column does not match this model.
    const vectorColumn = await prisma.$queryRaw<Array<{ dimensions: number }>>`
      SELECT a.atttypmod - 4 AS "dimensions"
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'DocumentChunk' AND a.attname = 'embedding' AND NOT a.attisdropped`;
    const databaseDimensions = Number(vectorColumn[0]?.dimensions);
    if (databaseDimensions !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `Database vector dimension is ${Number.isFinite(databaseDimensions) ? databaseDimensions : "unknown"}; expected ${EMBEDDING_DIMENSIONS}. Apply the local embedding migration before processing PDFs.`,
      );
    }

    // A retried job resumes after a worker failure instead of duplicating existing chunks.
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
        logger.info({ documentId, batchSize: batch.length, offset }, "Embedding legal document batch locally");
        const embeddings = await embeddingService.generateBatch(
          batch.map(({ chunk }) => chunk.content),
          "search_document",
        );
        for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
          const { chunk, index } = batch[batchIndex];
          const embedding = embeddings[batchIndex];
          if (!embedding?.length) throw new EmbeddingError("Local embedding model returned an empty embedding");
          assertEmbeddingDimension(embedding, "Legal document chunk");
          const embeddingVector = `[${embedding.join(",")}]`;
          await prisma.$executeRaw`
            INSERT INTO "DocumentChunk" (
              "id", "documentId", "sectionHeader", "sectionNumber", "chapter", "pageNumber", "content", "metadata", "embedding"
            ) VALUES (
              ${uuidv4()}, ${documentId}, ${chunk.sectionHeader ?? null}, ${chunk.sectionNumber ?? null},
              ${chunk.chapter ?? null}, ${chunk.pageNumber ?? null}, ${chunk.content},
              ${JSON.stringify({ extraction: "pdf-parse", chunkIndex: index, embeddingProvider: "local", embeddingModel: LOCAL_EMBEDDING_MODEL })}::jsonb, ${embeddingVector}::vector
            )`;
          stored++;
        }
      } catch (error) {
        // Never mark a document as successfully indexed when local inference fails.
        // BullMQ retry/backoff also covers temporary local resource failures.
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
