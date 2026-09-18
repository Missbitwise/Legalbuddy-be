import { Job } from "bullmq";
import { PDFParse } from "pdf-parse";
import logger from "../../common/logger";
import { embeddingService } from "../../common/utils/embeddings";
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

    let stored = 0;
    const failedChunks: number[] = [];
    for (const [index, chunk] of chunks.entries()) {
      try {
        const embedding = await embeddingService.generate(chunk.content);
        if (!embedding.length) throw new Error("Empty embedding returned");
        const embeddingVector = `[${embedding.join(",")}]`;
        await prisma.$executeRaw`
          INSERT INTO "DocumentChunk" (
            "id", "documentId", "sectionHeader", "sectionNumber", "chapter", "pageNumber", "content", "metadata", "embedding"
          ) VALUES (
            ${uuidv4()}, ${documentId}, ${chunk.sectionHeader ?? null}, ${chunk.sectionNumber ?? null},
            ${chunk.chapter ?? null}, ${chunk.pageNumber ?? null}, ${chunk.content},
            ${JSON.stringify({ extraction: "pdf-parse", chunkIndex: index })}::jsonb, ${embeddingVector}::vector
          )`;
        stored++;
      } catch (error) {
        failedChunks.push(index);
        logger.warn({ error, documentId, chunkIndex: index }, "Skipping chunk that could not be embedded or stored");
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
        failedChunks,
      },
      "PDF processed and chunks stored successfully",
    );
  } catch (error) {
    logger.error(
      { error, documentId },
      "Failed to process legal document",
    );

    throw error;
  } finally {
    await parser?.destroy().catch((error) => logger.warn({ error, documentId }, "Failed to clean up PDF parser"));
  }
};
