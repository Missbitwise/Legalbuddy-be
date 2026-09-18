import { Prisma } from "../../generated/client/client";
import prisma from "../../config/prisma";
import { embeddingService } from "./embeddings";
import { analyzeLegalQuery, QueryAnalysis } from "./legal-query";
import logger from "../logger";

export interface RetrievedLegalChunk { id: string; documentId: string; content: string; sectionHeader: string | null; sectionNumber: string | null; chapter: string | null; pageNumber: number | null; documentTitle: string; category: string; sourceUrl: string | null; score: number; }
type RawCandidate = Omit<RetrievedLegalChunk, "score"> & { distance?: number | string | null };
const VECTOR_CANDIDATES = 30;
const MIN_CATEGORY_CANDIDATES = 12;

function rank(candidate: RawCandidate, analysis: QueryAnalysis): number {
  const haystack = `${candidate.content} ${candidate.sectionHeader ?? ""} ${candidate.sectionNumber ?? ""} ${candidate.chapter ?? ""}`.toLowerCase();
  const title = candidate.documentTitle.toLowerCase();
  let score = Math.max(0, 1 - Number(candidate.distance ?? 1)) * 0.6;
  if (analysis.categories.includes(candidate.category as never)) score += 0.18;
  score += Math.min(0.14, analysis.keywords.filter((word) => haystack.includes(word)).length * 0.025);
  if (analysis.sectionNumbers.some((n) => candidate.sectionNumber?.toLowerCase() === n || haystack.includes(`section ${n}`))) score += 0.45;
  if (analysis.articleNumbers.some((n) => candidate.sectionNumber?.toLowerCase() === n || haystack.includes(`article ${n}`))) score += 0.45;
  if (analysis.actNames.some((act) => title.includes(act.toLowerCase()))) score += 0.3;
  return score;
}

class RetrievalService {
  private async vectorCandidates(embedding: number[], categories?: string[]): Promise<RawCandidate[]> {
    const vector = `[${embedding.join(",")}]`;
    const categoryClause = categories?.length ? Prisma.sql`AND d."category" IN (${Prisma.join(categories)})` : Prisma.empty;
    return prisma.$queryRaw<RawCandidate[]>`
      SELECT c."id", c."documentId", c."content", c."sectionHeader", c."sectionNumber", c."chapter", c."pageNumber", d."title" AS "documentTitle", d."category", d."sourceUrl", c."embedding" <=> ${vector}::vector AS "distance"
      FROM "DocumentChunk" c INNER JOIN "LegalDocument" d ON d."id" = c."documentId"
      WHERE c."embedding" IS NOT NULL ${categoryClause}
      ORDER BY c."embedding" <=> ${vector}::vector LIMIT ${VECTOR_CANDIDATES}`;
  }

  private async exactCandidates(analysis: QueryAnalysis): Promise<RawCandidate[]> {
    if (!analysis.hasSpecificLawReference) return [];
    const terms = [...analysis.sectionNumbers, ...analysis.articleNumbers, ...analysis.actNames].slice(0, 8);
    const include = { document: { select: { title: true, category: true, sourceUrl: true } } };
    // Exact metadata is intentionally queried first: a Section 420 request must not be displaced by a generic text hit.
    const [structured, legacy] = await Promise.all([
      prisma.documentChunk.findMany({ where: { sectionNumber: { in: terms } }, take: VECTOR_CANDIDATES, include }),
      prisma.documentChunk.findMany({ where: { OR: terms.flatMap((term) => [{ sectionHeader: { contains: term, mode: "insensitive" as const } }, { content: { contains: term, mode: "insensitive" as const } }, { document: { title: { contains: term, mode: "insensitive" as const } } }]) }, take: VECTOR_CANDIDATES, include }),
    ]);
    return [...structured, ...legacy].map((row) => ({ id: row.id, documentId: row.documentId, content: row.content, sectionHeader: row.sectionHeader, sectionNumber: row.sectionNumber, chapter: row.chapter, pageNumber: row.pageNumber, documentTitle: row.document.title, category: row.document.category, sourceUrl: row.document.sourceUrl }));
  }

  async search(query: string, limit = 8): Promise<RetrievedLegalChunk[]> {
    const analysis = analyzeLegalQuery(query);
    try {
      const [exact, embedding] = await Promise.all([this.exactCandidates(analysis).catch((error) => { logger.warn({ error }, "Exact legal reference search failed"); return []; }), embeddingService.generate(query).catch((error) => { logger.warn({ error }, "Embedding failed; using metadata retrieval only"); return []; })]);
      const scoped = embedding.length && analysis.categories.length ? await this.vectorCandidates(embedding, analysis.categories).catch((error) => { logger.warn({ error }, "Category vector search failed"); return []; }) : [];
      const broad = embedding.length && (!analysis.categories.length || scoped.length < MIN_CATEGORY_CANDIDATES) ? await this.vectorCandidates(embedding).catch((error) => { logger.warn({ error }, "Broad vector search failed"); return []; }) : [];
      const candidates = new Map<string, RawCandidate>();
      for (const candidate of [...exact, ...scoped, ...broad]) {
        const existing = candidates.get(candidate.id);
        if (!existing || Number(candidate.distance ?? Infinity) < Number(existing.distance ?? Infinity)) candidates.set(candidate.id, candidate);
      }
      return [...candidates.values()].map((candidate) => ({ ...candidate, score: rank(candidate, analysis) })).sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) { logger.error({ error }, "Retrieval search failed, continuing without context"); return []; }
  }
}
export const retrievalService = new RetrievalService();
