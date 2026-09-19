import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import logger from "../logger";

// BGE-small is a retrieval-trained Sentence Transformer. Its ONNX model runs locally
// through Transformers.js; it does not make an embedding API request after download.
export const LOCAL_EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";
export const EMBEDDING_DIMENSIONS = 384;
export const MAX_EMBEDDING_BATCH_SIZE = 4;
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

export class EmbeddingError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "EmbeddingError";
  }
}

function embeddingFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/out of memory|oom|memory allocation/i.test(message)) {
    return `Local embedding inference ran out of memory. Allocate at least 1 GB RAM to the worker: ${message}`;
  }
  return message;
}

export function assertEmbeddingDimension(embedding: number[], context: string): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(`${context} produced ${embedding.length} dimensions; expected ${EMBEDDING_DIMENSIONS}. Check the local model and pgvector migration.`);
  }
  if (!embedding.every(Number.isFinite)) {
    throw new EmbeddingError(`${context} produced an invalid embedding value`);
  }
}

class EmbeddingService {
  private extractorPromise: Promise<FeatureExtractionPipeline> | undefined;

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      logger.info({ model: LOCAL_EMBEDDING_MODEL }, "Loading local embedding model");
      this.extractorPromise = pipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, { dtype: "q8" })
        .then((extractor) => {
          logger.info({ model: LOCAL_EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS }, "Local embedding model loaded");
          return extractor;
        })
        .catch((error: unknown) => {
          // Allow a later BullMQ retry to try loading again after a transient disk/network failure.
          this.extractorPromise = undefined;
          const message = embeddingFailureMessage(error);
          logger.error({ error: { message }, model: LOCAL_EMBEDDING_MODEL }, "Failed to load local embedding model");
          throw new EmbeddingError(`Failed to load local embedding model: ${message}`, error);
        });
    }
    return this.extractorPromise;
  }

  /** Embeds a user question with BGE's recommended retrieval instruction. */
  async generate(text: string): Promise<number[]> {
    const [embedding] = await this.generateBatch([text], "search_query");
    if (!embedding) throw new EmbeddingError("Local embedding model returned no query embedding");
    return embedding;
  }

  /** Embeds legal chunks locally in CPU-friendly batches. */
  async generateBatch(texts: string[], inputType: "search_document" | "search_query" = "search_document"): Promise<number[][]> {
    if (!texts.length) return [];
    if (texts.length > MAX_EMBEDDING_BATCH_SIZE) throw new EmbeddingError(`Embedding batches cannot exceed ${MAX_EMBEDDING_BATCH_SIZE} texts`);
    if (texts.some((text) => !text.trim())) throw new EmbeddingError("Cannot generate an embedding for empty text");

    try {
      const extractor = await this.getExtractor();
      const modelInputs = inputType === "search_query" ? texts.map((text) => `${QUERY_PREFIX}${text}`) : texts;
      logger.info({ model: LOCAL_EMBEDDING_MODEL, batchSize: texts.length, inputType }, "Embedding local text batch");
      const output = await extractor(modelInputs, { pooling: "mean", normalize: true });
      if (output.dims.length !== 2 || output.dims[0] !== texts.length || output.dims[1] !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingError(`Local embedding model returned tensor dimensions [${output.dims.join(", ")}]; expected [${texts.length}, ${EMBEDDING_DIMENSIONS}]`);
      }

      const embeddings = Array.from({ length: texts.length }, (_, index) => {
        const embedding = Array.from(output.data.slice(index * EMBEDDING_DIMENSIONS, (index + 1) * EMBEDDING_DIMENSIONS));
        assertEmbeddingDimension(embedding, "Local embedding model");
        return embedding;
      });
      logger.info({ model: LOCAL_EMBEDDING_MODEL, batchSize: texts.length }, "Embedding generation completed");
      return embeddings;
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      const message = embeddingFailureMessage(error);
      logger.error({ error: { message }, model: LOCAL_EMBEDDING_MODEL }, "Local embedding inference failed");
      throw new EmbeddingError(`Local embedding inference failed: ${message}`, error);
    }
  }
}

export const embeddingService = new EmbeddingService();
