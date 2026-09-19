import axios from "axios";
import logger from "../logger";

const COHERE_EMBED_URL = "https://api.cohere.com/v2/embed";
const COHERE_EMBED_MODEL = "embed-v4.0";
const EMBEDDING_DIMENSIONS = 1024;
export const MAX_EMBEDDING_BATCH_SIZE = 96;
const MAX_TRANSIENT_RETRIES = 4;

export class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "EmbeddingError";
  }
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(error: any, attempt: number): number {
  const headerDelay = Number(error?.response?.headers?.["retry-after"]) * 1000;
  const exponentialDelay = Math.min(60_000, 1_000 * 2 ** (attempt - 1));
  return Math.max(exponentialDelay, Number.isFinite(headerDelay) ? headerDelay : 0) + Math.floor(Math.random() * 500);
}

class EmbeddingService {
  /** Embeds a user question using Cohere's query-optimized representation. */
  async generate(text: string): Promise<number[]> {
    const [embedding] = await this.generateBatch([text], "search_query");
    return embedding ?? [];
  }

  /** Embeds up to 96 legal chunks in one Cohere request. */
  async generateBatch(texts: string[], inputType: "search_document" | "search_query"): Promise<number[][]> {
    if (!texts.length) return [];
    if (texts.length > MAX_EMBEDDING_BATCH_SIZE) throw new EmbeddingError(`Embedding batches cannot exceed ${MAX_EMBEDDING_BATCH_SIZE} texts`);
    const apiKey = process.env.COHERE_API_KEY?.trim();
    if (!apiKey) throw new EmbeddingError("COHERE_API_KEY is not configured");

    for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        const response = await axios.post(
          COHERE_EMBED_URL,
          {
            model: COHERE_EMBED_MODEL,
            texts,
            input_type: inputType,
            embedding_types: ["float"],
            output_dimension: EMBEDDING_DIMENSIONS,
            truncate: "END",
          },
          { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 60_000 },
        );
        const embeddings = response.data?.embeddings?.float;
        if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
          throw new EmbeddingError("Cohere returned an incomplete embedding batch");
        }
        return embeddings;
      } catch (error: any) {
        const status = error?.response?.status;
        const transient = status === 429 || status === 408 || (status >= 500 && status <= 599);
        if (transient && attempt < MAX_TRANSIENT_RETRIES) {
          const delay = retryDelay(error, attempt);
          logger.warn({ status, attempt, retryAfterMs: delay }, "Cohere embedding request limited or temporarily unavailable; retrying");
          await sleep(delay);
          continue;
        }
        logger.error({ error: { status, name: error?.name, message: error?.response?.data?.message || error?.message }, attempt }, "Failed to generate Cohere embedding");
        throw new EmbeddingError("Failed to generate Cohere embedding", status);
      }
    }
    throw new EmbeddingError("Failed to generate Cohere embedding");
  }
}

export const embeddingService = new EmbeddingService();
