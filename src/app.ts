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
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  // Production Vercel domains
  "https://legalbuddy-fe.vercel.app",
  // Allow all Vercel preview deployments for this project
  /https:\/\/legalbuddy.*\.vercel\.app$/,
  // Extra origins from environment variable (comma-separated)
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins.some((o) =>
        typeof o === "string" ? o === origin : o.test(origin)
      );
      if (allowed) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
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