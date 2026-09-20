import { Queue } from "bullmq";
import { redisConnection } from "../redis/connection";
import { QUEUES, JOBS } from "../constants/queue.constants";

class QueueService {
  private queues: Map<string, Queue> = new Map();

  getQueue(name: string): Queue {
    if (!redisConnection) {
      throw new Error("Redis is disabled");
    }

    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: redisConnection,
      });

      this.queues.set(name, queue);
    }

    return this.queues.get(name)!;
  }

  async addJob(
    queueName: string,
    jobName: string,
    data: any,
  ) {
    const queue = this.getQueue(queueName);

    const job = await queue.add(jobName, data, {
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
      removeOnFail: {
        age: 86400,
        count: 100,
      },
    });

    return job;
  }

  async addLegalDocumentJob(data: {
    documentId: string;
    fileBase64: string;
    title: string;
  }) {
    const queue = this.getQueue(QUEUES.LEGAL_DOCUMENT);

    return queue.add(JOBS.PROCESS_LEGAL_PDF, data, {
      attempts: 12,
      backoff: {
        type: "exponential",
        delay: 60_000,
      },
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
      removeOnFail: {
        age: 86400,
        count: 100,
      },
    });
  }
}

export const queueService = new QueueService();