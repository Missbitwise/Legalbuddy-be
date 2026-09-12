import "dotenv/config";
import app from "./app";
import logger from "./common/logger";
import { createServer } from "http";
import "./queue/redis/connection";
import { setupLegalWorker } from "./queue/workers/legal.worker";

const PORT = process.env.PORT || 8080;

const httpServer = createServer(app);

// Increase timeouts for long-running AI voice operations (transcription + RAG + TTS)
httpServer.setTimeout(300000); // 5 minutes
httpServer.keepAliveTimeout = 300000;
httpServer.headersTimeout = 305000;

setupLegalWorker();

httpServer.listen(PORT, () => {
  logger.info(`server running on port ${PORT}`);
});