export interface LegalChunk {
  content: string;
  sectionHeader?: string;
  sectionNumber?: string;
  chapter?: string;
  pageNumber?: number;
}

interface PageText { text: string; num?: number }

const STRUCTURE = /^(?:(Article|Section)\s+(\d+[A-Za-z]?(?:\s*\([^)]*\))?)|(?:CHAPTER|PART|SCHEDULE)\s+([A-ZIVXLC\d.-]+)|\d+\.\s+)/im;
const CHAPTER = /^((?:CHAPTER|PART|SCHEDULE)\s+.+)$/im;
const PROVISION = /^(Article|Section)\s+(\d+[A-Za-z]?(?:\s*\([^)]*\))?)/im;

function splitLargeProvision(text: string, maxSize: number): string[] {
  const sentences = text.split(/(?<=[.;:])\s+(?=(?:\([a-z0-9ivx]+\)|\d+\.|[A-Z]))/i);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxSize) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${current ? " " : ""}${sentence}`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Keeps provisions intact where possible; only long provisions split on sentence/subsection boundaries. */
export function createLegalChunks(pages: PageText[], maxSize = 1800): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  let chapter: string | undefined;
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const text = page.text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) continue;
    const chapterMatch = text.match(CHAPTER);
    if (chapterMatch) chapter = chapterMatch[1].trim();
    const pieces = text.split(/(?=^(?:(?:Article|Section)\s+\d+[A-Za-z]?(?:\s*\([^)]*\))?|(?:CHAPTER|PART|SCHEDULE)\s+))/im).filter(Boolean);
    for (const piece of pieces) {
      const provision = piece.match(PROVISION);
      const header = piece.split("\n").find((line) => STRUCTURE.test(line.trim()))?.trim();
      const base = { sectionHeader: header, sectionNumber: provision?.[2], chapter, pageNumber: page.num ?? index + 1 };
      for (const content of (piece.length > maxSize ? splitLargeProvision(piece, maxSize) : [piece])) {
        if (content.trim()) chunks.push({ ...base, content: content.trim() });
      }
    }
  }
  return chunks;
}
