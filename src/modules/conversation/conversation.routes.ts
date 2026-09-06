import { Router } from "express";
import { ConversationController } from "./conversation.controller";
import { authMiddleware } from "../../common/middleware/auth.middleware";

const router = Router();

router.post(
  "/",
  authMiddleware,
  ConversationController.create,
);

router.get(
  "/",
  authMiddleware,
  ConversationController.getAll,
);

router.get(
  "/:id",
  authMiddleware,
  ConversationController.getOne,
);

router.post(
  "/:id/messages",
  authMiddleware,
  ConversationController.sendMessage,
);

router.delete(
  "/:id",
  authMiddleware,
  ConversationController.delete,
);

export default router;