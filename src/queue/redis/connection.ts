// import { Redis } from "ioredis";
// import logger from "../../common/logger";

// const redisUrl = process.env.REDIS_URL;

// export const redisConnection = redisUrl
//   ? new Redis(redisUrl, {
//       maxRetriesPerRequest: null,
//       tls: redisUrl.startsWith("rediss://") ? {} : undefined,
//     })
//   : new Redis({
//       host: process.env.REDIS_HOST || "localhost",
//       port: Number(process.env.REDIS_PORT) || 6379,
//       password: process.env.REDIS_PASSWORD || undefined,
//       maxRetriesPerRequest: null,
//     });

// redisConnection.on("connect", () => {
//   logger.info("Redis connected successfully");
// });

// redisConnection.on("error", (error) => {
//   logger.error({ error }, "Redis connection error");
// });

import { Redis, RedisOptions } from "ioredis";
import logger from "../../common/logger";

export const isRedisEnabled = process.env.REDIS_ENABLED !== "false";

const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  maxRetriesPerRequest: null,
};
console.log("REDIS OPTIONS: ", redisOptions)

export const redisConnection = isRedisEnabled ? new Redis(redisOptions) : null;

if (redisConnection) {
  redisConnection.on("connect", () => {
    logger.info("Redis connected successfully");
  });

  redisConnection.on("error", (error) => {
    logger.error(error, "Redis connection error");
  });
} else {
  logger.info("Redis disabled. Queue connections will not be created.");
}
