import { Worker } from "bullmq";
import { redisConnection } from "../redis/connection";
import { QUEUES, JOBS } from "../constants/queue.constants";
import { processLegalDocument } from "../jobs/legal.job";
import logger from "../../common/logger";

export const setupLegalWorker = () => {
  if (!redisConnection) {
    logger.info("Redis disabled. Worker process will not be started.");
    return;
  }

  const worker = new Worker(
    QUEUES.LEGAL_DOCUMENT,
    async (job) => {
      if (job.name === JOBS.PROCESS_LEGAL_PDF) {
        return processLegalDocument(job);
      }
    },
    {
      connection: redisConnection,
      // Keep long-running legal ingestions serialized to protect worker resources.
      concurrency: 1,
      lockDuration: 15 * 60 * 1000,
    },
  );

  return worker;
};
