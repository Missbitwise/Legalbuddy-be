import { Job } from "bullmq";
import { PDFParse } from "pdf-parse";
import logger from "../../common/logger";
import { embeddingService } from "../../common/utils/embeddings";
import prisma from "../../config/prisma";
import { v4 as uuidv4 } from "uuid";

export interface LegalJobData {
  documentId: string;
  fileBase64: string;
  title: string;
}

const createChunks = (text: string, maxChunkSize = 1500) => {
  const chunks: string[] = [];
  // Split by double newline (paragraphs) first
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    
    // If a single paragraph is longer than maxChunkSize, we just have to add it (or split by sentences, but this is a good fallback)
    if (paragraph.length > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      
      // Split giant paragraph by sentences (periods)
      const sentences = paragraph.split(/(?<=\.)\s+/);
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        currentChunk += sentence + " ";
      }
    } else {
      currentChunk += paragraph + "\n\n";
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

export const processLegalDocument = async (
  job: Job<LegalJobData>,
) => {
  const { documentId, fileBase64, title } = job.data;

  try {
    logger.info(
      { documentId, jobId: job.id },
      "Starting PDF processing",
    );

    // Convert Base64 back into PDF Buffer
    const fileBuffer = Buffer.from(fileBase64, "base64");

    // Parse the PDF
    const parser = new PDFParse({
      data: fileBuffer,
    });

    const textResult = await parser.getText();

    const content = textResult.text;

    if (!content || content.trim().length === 0) {
      throw new Error("Could not extract text from PDF");
    }

    // Split extracted text into chunks
    const chunks = createChunks(content);

    console.log("Total chunks:", chunks.length);

    // Generate embedding and save each chunk
    for (const chunk of chunks) {
  const embedding = await embeddingService.generate(chunk);

  console.log("Embedding length:", embedding.length);

  const embeddingVector = `[${embedding.join(",")}]`;

  const chunkId = uuidv4();

  await prisma.$executeRaw`
    INSERT INTO "DocumentChunk" (
      "id",
      "documentId",
      "content",
      "embedding"
    )
    VALUES (
      ${chunkId},
      ${documentId},
      ${chunk},
      ${embeddingVector}::vector
    )
  `;

  console.log("Chunk saved successfully");
}

    logger.info(
      {
        documentId,
        title,
        textLength: content.length,
        chunksCreated: chunks.length,
      },
      "PDF processed and chunks stored successfully",
    );
  } catch (error) {
    logger.error(
      { error, documentId },
      "Failed to process legal document",
    );

    throw error;
  }
};