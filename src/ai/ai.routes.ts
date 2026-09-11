import { Router } from "express";
import { authMiddleware } from "../common/middleware/auth.middleware";

import { AIController } from "./ai.controller";

const router = Router();

router.post(
  "/ask",
  authMiddleware,
  AIController.ask,
);
export default router;