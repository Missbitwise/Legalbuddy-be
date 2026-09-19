import axios from "axios";
import logger from "../logger";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const EMBED_MODEL = "gemini-embedding-2";

// Keep the same dimension as the existing vectors in PostgreSQL.
const EMBEDDING_DIMENSIONS = 3072;
const configuredRequestsPerMinute = Number(process.env.GEMINI_EMBEDDING_REQUESTS_PER_MINUTE ?? 60);
const REQUESTS_PER_MINUTE = Number.isFinite(configuredRequestsPerMinute) && configuredRequestsPerMinute > 0
  ? configuredRequestsPerMinute
  : 60;
const REQUEST_INTERVAL_MS = Math.ceil(60_000 / REQUESTS_PER_MINUTE);
const MAX_TRANSIENT_RETRIES = 4;

export class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "EmbeddingError";
  }
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(error: any, attempt: number): number {
  const header = error?.response?.headers?.["retry-after"];
  const headerDelay = Number(header) * 1000;
  const message = String(error?.response?.data?.error?.message ?? "");
  const messageDelay = Number(message.match(/retry in\s+([\d.]+)s/i)?.[1]) * 1000;
  const exponentialDelay = Math.min(60_000, 1_000 * 2 ** (attempt - 1));
  return Math.max(exponentialDelay, Number.isFinite(headerDelay) ? headerDelay : 0, Number.isFinite(messageDelay) ? messageDelay : 0) + Math.floor(Math.random() * 500);
}

function getAuthHeaders() {
  const key = process.env.GEMINI_API_KEY?.trim() || "";

  return {
    "x-goog-api-key": key,
    "Content-Type": "application/json",
  };
}

class EmbeddingService {
  private nextRequestAt = 0;
  private slotTail: Promise<void> = Promise.resolve();

  /** Serializes scheduling within this process so legal uploads stay below the configured RPM. */
  private async acquireRequestSlot(): Promise<void> {
    const previous = this.slotTail;
    let release!: () => void;
    this.slotTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;

    const now = Date.now();
    const delay = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(this.nextRequestAt, now) + REQUEST_INTERVAL_MS;
    release();
    if (delay) await sleep(delay);
  }

  async generate(text: string): Promise<number[]> {
    for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        await this.acquireRequestSlot();
        const response = await axios.post(
        `${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent`,
        {
          content: {
            parts: [
              {
                text,
              },
            ],
          },
          output_dimensionality: EMBEDDING_DIMENSIONS,
        },
        {
          headers: getAuthHeaders(),
          timeout: 30000,
        }
      );

        return response.data?.embedding?.values || [];
      } catch (error: any) {
        const status = error?.response?.status;
        const message = error?.response?.data?.error?.message || error?.message || "Failed to generate embedding";
        const transient = status === 429 || status === 408 || (status >= 500 && status <= 599);
        if (transient && attempt < MAX_TRANSIENT_RETRIES) {
          const delay = retryDelay(error, attempt);
          logger.warn({ status, attempt, retryAfterMs: delay }, "Embedding request limited or temporarily unavailable; retrying");
          await sleep(delay);
          continue;
        }
        logger.error(
          {
            error: {
              status,
              name: error?.name,
              message,
            },
            attempt,
          },
          "Failed to generate embedding",
        );
        throw new EmbeddingError("Failed to generate embedding", status);
      }
    }
    throw new EmbeddingError("Failed to generate embedding");
  }
}

export const embeddingService = new EmbeddingService();
