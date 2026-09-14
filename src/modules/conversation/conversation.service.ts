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

  async editAndResendMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    newContent: string,
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

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    const targetIndex = messages.findIndex((m) => m.id === messageId);
    if (targetIndex === -1) {
      throw new AppError("Message not found", 404);
    }

    // Delete all messages from targetIndex onwards (the old user prompt and subsequent answers)
    const idsToDelete = messages.slice(targetIndex).map((m) => m.id);
    await prisma.message.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    // Answer with the newly edited prompt
    const result = await ragService.answerQuestion(
      newContent,
      userId,
      conversationId,
    );

    return result;
  }
}