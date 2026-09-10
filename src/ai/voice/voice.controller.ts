import { Response, NextFunction } from "express";
import logger from "../../common/logger";

import { AuthRequest } from "../../common/middleware/auth.middleware";
import { voiceService } from "./voice.service";
import { ragService } from "../rag/rag.service";

export class VoiceController {
  // Audio -> Text
  static dictate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Audio is required" });
      }

      const text = await voiceService.transcribe(
        req.file.buffer,
        req.file.mimetype,
      );

      return res.status(200).json({ text });
    } catch (error) {
      next(error);
    }
  };

  // Audio -> Text -> RAG -> Gemini -> Audio
  static voiceConversation = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Audio is required" });
      }

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 1. Convert audio -> text
      const text = await voiceService.transcribe(
        req.file.buffer,
        req.file.mimetype,
      );

      if (!text) {
        return res.status(422).json({ message: "Could not understand the audio" });
      }

      // 2. Send text to RAG -> Gemini
      const result = await ragService.answerQuestion(
        text,
        req.user.id,
        req.body.conversationId,
      );

      // 3. Get Gemini answer text
      const answer = result.response.content;

      logger.info(
        { answerLength: answer?.length },
        "Got Gemini answer, synthesizing speech",
      );

      // 4. Convert Gemini answer -> audio
      const audio = await voiceService.synthesize(answer);

      // 5. Send audio response
      res.setHeader("X-Conversation-Id", result.conversationId);
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", audio.length);

      return res.status(200).send(audio);
    } catch (error) {
      logger.error({ error }, "Voice conversation handler error");
      next(error);
    }
  };
}
