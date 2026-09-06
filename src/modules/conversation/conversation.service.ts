import prisma from "../../config/prisma";
import { ragService } from "../../ai/rag/rag.service";
import { AppError } from "../../common/errors/app-error";

export class ConversationService {
  async createConversation(
    userId: string,
    title?: string,
    category?: string,
  ) {
    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title,
        category,
      },
    });

    return conversation;
  }

  async getUserConversations(userId: string) {
    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return conversations;
  }

  async getConversationById(
    userId: string,
    conversationId: string,
  ) {
    const conversation =
      await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

    return conversation;
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ) {
    const conversation =
      await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
      });

  if (!conversation) {
  throw new AppError("Conversation not found", 404);
}

    const result = await ragService.answerQuestion(
      content,
      userId,
      conversationId,
    );

    return result;
  }

  async deleteConversation(
  userId: string,
  conversationId: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
  });

  if (!conversation) {
  throw new AppError("Conversation not found", 404);
}

  await prisma.conversation.delete({
    where: {
      id: conversationId,
    },
  });

  return {
    message: "Conversation deleted successfully",
  };
}
}