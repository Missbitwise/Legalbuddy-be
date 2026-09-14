import { Response } from "express";
import { AuthRequest } from "../../common/middleware/auth.middleware";
import { ConversationService } from "./conversation.service";

const conversationService = new ConversationService();

export class ConversationController {
  static create = async (req: AuthRequest, res: Response) => {
    const { title, category } = req.body;

    const userId = req.user!.id;

    const conversation =
      await conversationService.createConversation(
        userId,
        title,
        category,
      );

    return res.status(201).json({
      conversation,
    });
  };
  static getAll = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const conversations =
    await conversationService.getUserConversations(userId);

  return res.status(200).json({
    conversations,
  });

  
};

static getOne = async (
  req: AuthRequest & { params: { id: string } },
  res: Response,
) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;

  const conversation =
    await conversationService.getConversationById(
      userId,
      conversationId,
    );

  if (!conversation) {
    return res.status(404).json({
      message: "Conversation not found",
    });
  }

  return res.status(200).json({
    conversation,
  });
};

static sendMessage = async (
  req: AuthRequest & { params: { id: string } },
  res: Response,
) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;
  const { content } = req.body;

  const message = await conversationService.sendMessage(
    userId,
    conversationId,
    content,
  );

  return res.status(201).json({
    message,
  });
  
};

static delete = async (
  req: AuthRequest & { params: { id: string } },
  res: Response,
) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;

  const result =
    await conversationService.deleteConversation(
      userId,
      conversationId,
    );

  return res.status(200).json(result);
};

static editAndResendMessage = async (
  req: AuthRequest & { params: { id: string; messageId: string } },
  res: Response,
) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;
  const messageId = req.params.messageId;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: "Message content is required" });
  }

  const result = await conversationService.editAndResendMessage(
    userId,
    conversationId,
    messageId,
    content.trim(),
  );

  return res.status(200).json(result);
};

}