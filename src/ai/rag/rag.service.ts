import prisma from "../../config/prisma";
import { retrievalService } from "../../common/utils/retrieval";
import { aiOrchestrator } from "../orchestrator/ai-orchestrator";
import { AppError } from "../../common/errors/app-error";

class RAGService {
  async answerQuestion(
    question: string,
    userId: string,
    conversationId?: string,
  ) {
    let conversation;

    // 1. Find existing conversation
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId: userId,
        },
      });

      if (!conversation) {
        throw new AppError("Conversation not found", 404);
      }
    }

    // 2. Create new conversation
    else {
      conversation = await prisma.conversation.create({
        data: {
          title: question.slice(0, 50),
          user: {
            connect: {
              id: userId,
            },
          },
        },
      });
    }

    // 3. Get previous messages
    const previousMessages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // 4. Convert previous messages into conversation history
    const conversationHistory = previousMessages
      .map(
        (message) =>
          `${message.role}: ${message.content}`,
      )
      .join("\n");

    // 5. Save current user's question
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: question,
      },
    });

    // 6. Retrieve relevant document chunks
    const chunks = (await retrievalService.search(
      question,
      5,
    )) as Array<{
      content: string;
    }>;

    // 7. Create context from document chunks
    const context = chunks
      .map((chunk) => chunk.content)
      .join("\n\n");

    // 8. Create prompt
    const prompt = `
You are LegalBuddy, a legal AI assistant.

Use the previous conversation and the provided
legal document context to answer the user's latest question.

If the answer cannot be found in the provided documents,
say that you could not find enough information.

Previous conversation:
${conversationHistory}

Legal document context:
${context}

Latest user question:
${question}
`;

    // 9. Generate AI response
    const response =
      await aiOrchestrator.generateResponse(prompt);

    // 10. Save AI response
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: response.content,
      },
    });

    // 11. Return response
    return {
      conversationId: conversation.id,
      response,
    };
  }
}

export const ragService = new RAGService();