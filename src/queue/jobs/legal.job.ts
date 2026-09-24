import { Job, UnrecoverableError } from "bullmq";
import { PDFParse } from "pdf-parse";
import logger from "../../common/logger";
import {
  assertEmbeddingDimension,
  EMBEDDING_DIMENSIONS,
  EmbeddingError,
  embeddingService,
  LOCAL_EMBEDDING_MODEL,
  MAX_EMBEDDING_BATCH_SIZE,
} from "../../common/utils/embeddings";
import { createLegalChunks } from "../../common/utils/legal-chunking";
import prisma from "../../config/prisma";
import { v4 as uuidv4 } from "uuid";

export interface LegalJobData {
  documentId: string;
  fileBase64: string;
  title: string;
}

const assertLegalDocumentExists = async (
  documentId: string,
  jobId: string | undefined,
  phase: "before processing" | "after a chunk insert failure",
) => {
  const document = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { id: true },
  });

  if (!document) {
    logger.warn(
      { documentId, jobId, phase },
      "Skipping legal document job because its parent document no longer exists",
    );

   
    throw new UnrecoverableError(
      `LegalDocument ${documentId} no longer exists`,
    );
  }
};

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

    
    await assertLegalDocumentExists(documentId, job.id, "before processing");

    const fileBuffer = Buffer.from(fileBase64, "base64");

    parser = new PDFParse({
      data: fileBuffer,
    });

    const textResult = await parser.getText();
    const content = textResult.text;

    if (!content || content.trim().length === 0) {
      throw new Error("Could not extract text from PDF");
    }

    const chunks = createLegalChunks(textResult.pages);

    if (!chunks.length) {
      throw new Error("No usable legal provisions were found in PDF");
    }

    const vectorColumn = await prisma.$queryRaw<
      Array<{ columnType: string }>
    >`
      SELECT format_type(a.atttypid, a.atttypmod) AS "columnType"
      FROM pg_attribute a
      WHERE a.attrelid = '"DocumentChunk"'::regclass
        AND a.attname = 'embedding'
        AND NOT a.attisdropped
    `;

    const columnType = vectorColumn[0]?.columnType;

    const dimensionMatch = columnType?.match(
      /vector\((\d+)\)/,
    );

    const databaseDimensions = Number(
      dimensionMatch?.[1],
    );

    if (databaseDimensions !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `Database vector dimension is ${
          Number.isFinite(databaseDimensions)
            ? databaseDimensions
            : "unknown"
        }; expected ${EMBEDDING_DIMENSIONS}. Apply the local embedding migration before processing PDFs.`,
      );
    }

    const existingChunks = await prisma.$queryRaw<
      Array<{ chunkIndex: string }>
    >`
      SELECT "metadata" ->> 'chunkIndex' AS "chunkIndex"
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId}
        AND "metadata" ->> 'chunkIndex' IS NOT NULL
    `;

    const storedIndices = new Set(
      existingChunks
        .map((row) => Number(row.chunkIndex))
        .filter(Number.isInteger),
    );

    let stored = storedIndices.size;

    const pendingChunks = chunks
      .map((chunk, index) => ({ chunk, index }))
      .filter(({ index }) => !storedIndices.has(index));

    for (
      let offset = 0;
      offset < pendingChunks.length;
      offset += MAX_EMBEDDING_BATCH_SIZE
    ) {
      const batch = pendingChunks.slice(
        offset,
        offset + MAX_EMBEDDING_BATCH_SIZE,
      );

      try {
        logger.info(
          {
            documentId,
            batchSize: batch.length,
            offset,
            chunkIndexes: batch.map(({ index }) => index),
            textLengths: batch.map(
              ({ chunk }) => chunk.content.length,
            ),
          },
          "STEP 1: Batch started",
        );

       
        logger.info(
          {
            documentId,
            offset,
            batchSize: batch.length,
          },
          "STEP 2: Starting embedding generation",
        );

        const embeddings =
          await embeddingService.generateBatch(
            batch.map(({ chunk }) => chunk.content),
            "search_document",
          );

        logger.info(
          {
            documentId,
            offset,
            batchSize: batch.length,
            embeddingsGenerated: embeddings.length,
          },
          "STEP 3: Embedding generation completed",
        );

        for (
          let batchIndex = 0;
          batchIndex < batch.length;
          batchIndex++
        ) {
          const { chunk, index } = batch[batchIndex];
          const embedding = embeddings[batchIndex];

          logger.info(
            {
              documentId,
              offset,
              batchIndex,
              chunkIndex: index,
              textLength: chunk.content.length,
            },
            "STEP 4: Starting database insert",
          );

          if (!embedding?.length) {
            throw new EmbeddingError(
              "Local embedding model returned an empty embedding",
            );
          }

          assertEmbeddingDimension(
            embedding,
            "Legal document chunk",
          );

          const embeddingVector = `[${embedding.join(",")}]`;

          await prisma.$executeRaw`
            INSERT INTO "DocumentChunk" (
              "id",
              "documentId",
              "sectionHeader",
              "sectionNumber",
              "chapter",
              "pageNumber",
              "content",
              "metadata",
              "embedding"
            )
            VALUES (
              ${uuidv4()},
              ${documentId},
              ${chunk.sectionHeader ?? null},
              ${chunk.sectionNumber ?? null},
              ${chunk.chapter ?? null},
              ${chunk.pageNumber ?? null},
              ${chunk.content},
              ${JSON.stringify({
                extraction: "pdf-parse",
                chunkIndex: index,
                embeddingProvider: "local",
                embeddingModel: LOCAL_EMBEDDING_MODEL,
              })}::jsonb,
              ${embeddingVector}::vector
            )
          `;

          logger.info(
            {
              documentId,
              offset,
              batchIndex,
              chunkIndex: index,
            },
            "STEP 5: Database insert completed",
          );

          stored++;
        }

        logger.info(
          {
            documentId,
            offset,
            batchSize: batch.length,
          },
          "STEP 6: Batch completely finished",
        );
      } catch (error) {
        await assertLegalDocumentExists(
          documentId,
          job.id,
          "after a chunk insert failure",
        );

        throw error;
      }
    }

    if (!stored) {
      throw new Error(
        "No chunks could be embedded and stored",
      );
    }

    logger.info(
      {
        documentId,
        title,
        textLength: content.length,
        pages: textResult.pages.length,
        chunksCreated: chunks.length,
        chunksStored: stored,
        chunksResumed: storedIndices.size,
      },
      "PDF processed and chunks stored successfully",
    );
  } catch (error) {
    logger.error(
      {
        error: {
          name:
            error instanceof Error
              ? error.name
              : undefined,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
        documentId,
      },
      "Failed to process legal document",
    );

    throw error;
  } finally {
    await parser?.destroy().catch((error) =>
      logger.warn(
        { error, documentId },
        "Failed to clean up PDF parser",
      ),
    );
  }
};
