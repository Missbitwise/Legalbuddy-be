import { Router } from "express";
import multer from "multer";

import { authMiddleware } from "../../common/middleware/auth.middleware";
import { VoiceController } from "./voice.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

router.post(
  "/dictate",
  authMiddleware,
  upload.single("audio"),
  VoiceController.dictate,
);

router.post(
  "/conversation",
  authMiddleware,
  upload.single("audio"),
  VoiceController.voiceConversation,
);

export default router;