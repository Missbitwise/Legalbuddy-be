import prisma from "../../config/prisma";
import { retrievalService } from "../../common/utils/retrieval";
import { aiOrchestrator } from "../orchestrator/ai-orchestrator";
import { AppError } from "../../common/errors/app-error";
import { RetrievedLegalChunk } from "../../common/utils/retrieval";

function formatFallbackTitle(question: string): string {
  let cleaned = question
    .replace(/["'*_#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 42) {
    const cut = cleaned.slice(0, 42);
    const lastSpace = cut.lastIndexOf(" ");

    cleaned =
      (lastSpace > 15 ? cut.slice(0, lastSpace) : cut) + "...";
  }

  return cleaned
    ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    : "Legal Consultation";
}

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
          title: formatFallbackTitle(question),
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
      .slice(-12)
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
    const chunks = await retrievalService.search(question, 8);

    // 7. Create context from document chunks
    const context = chunks
      .map((chunk, index) => {
        const location = [
          chunk.sectionHeader ?? (chunk.sectionNumber ? `Section/Article ${chunk.sectionNumber}` : undefined),
          chunk.chapter,
          chunk.pageNumber ? `page ${chunk.pageNumber}` : undefined,
        ].filter(Boolean).join(", ");
        return `[Source ${index + 1}: ${chunk.documentTitle}${location ? ` — ${location}` : ""}]\n${chunk.content}`;
      })
      .join("\n\n");

    // 8. Create prompt
    const prompt = `
You are LegalBuddy, a legal AI assistant.

Answer the latest question using Legal document context as the only source for specific legal claims.
Conversation history is only for resolving references in the latest question; it is not a legal source.

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
- Do not infer or invent sections, articles, Acts, punishments, procedures, cases, dates, or rights.
- When relying on a source, identify it using the supplied Source label. Do not create citations that are not supplied.

Previous conversation:
${conversationHistory}

Legal document context:
${context}

Latest user question:
${question}
`;

    // 9. Generate AI response
    const response = await aiOrchestrator.generateResponse(prompt);
    const sources = chunks.map((chunk: RetrievedLegalChunk) => ({
      documentId: chunk.documentId,
      title: chunk.documentTitle,
      category: chunk.category,
      section: chunk.sectionHeader ?? chunk.sectionNumber ?? undefined,
      chapter: chunk.chapter ?? undefined,
      page: chunk.pageNumber ?? undefined,
      sourceUrl: chunk.sourceUrl ?? undefined,
    }));
    response.metadata = { ...response.metadata, sources };

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
