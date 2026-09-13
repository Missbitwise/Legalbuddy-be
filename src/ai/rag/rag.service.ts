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

IMPORTANT LANGUAGE RULE:
- Detect the language of the user's latest question.
- Respond in the same language as the user's question.
- If the user asks in Hindi, respond in Hindi.
- If the user asks in English, respond in English.
- If the user asks in another language, respond in that language when possible.
- Do not translate, modify, or change the legal meaning of the provided legal context.

LEGAL ACCURACY RULE:
- Use the provided legal document context as the primary source for your answer.
- Do not invent legal provisions, sections, articles, cases, or facts.
- If the answer cannot be found in the provided documents, say that you could not find enough information.
- If the provided context is insufficient or unclear, clearly state that you do not have enough information rather than guessing.

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