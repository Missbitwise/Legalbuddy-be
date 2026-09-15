import { Redis } from "ioredis";
import logger from "../../common/logger";

const redisUrl = process.env.REDIS_URL;

export const redisConnection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    })
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

redisConnection.on("connect", () => {
  logger.info("Redis connected successfully");
});

redisConnection.on("error", (error) => {
  logger.error({ error }, "Redis connection error");
});