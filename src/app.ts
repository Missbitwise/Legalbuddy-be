import express, {Application} from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes";
import conversationRoutes from "./modules/conversation/conversation.routes";
import aiRoutes from "./ai/ai.routes";
import legalRoutes from "./modules/legal/legal.routes";
import { globalErrorHandler } from "./common/middleware/error.middleware";
import voiceRoutes from "./ai/voice/voice.routes";

dotenv.config();

const app: Application = express()

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
    ],
    exposedHeaders: ["X-Conversation-Id"],
    credentials: true,
  })
);
app.use(express.json());
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/legal", legalRoutes);
app.use("/api/v1/voice", voiceRoutes);

app.use(globalErrorHandler);
export default app;