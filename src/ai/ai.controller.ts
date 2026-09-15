import { Response, NextFunction } from "express";
import { AuthRequest } from "../common/middleware/auth.middleware";
import { ragService } from "./rag/rag.service";
import logger from "../common/logger";

export class AIController {
  static ask = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { question, conversationId } = req.body;

      if (!question) {
        return res.status(400).json({
          message: "Question is required",
        });
      }

      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const result = await ragService.answerQuestion(
        question,
        req.user.id,
        conversationId,
      );

      return res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, "AIController.ask failed");
      next(error);
    }
  };
}
