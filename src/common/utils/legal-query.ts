export const LEGAL_CATEGORIES = [
  "constitutional", "criminal", "criminal_procedure", "evidence", "civil",
  "contract", "property", "family", "employment", "labour", "consumer",
  "cyber", "taxation", "corporate", "intellectual_property", "environmental", "other",
] as const;

export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

export interface QueryAnalysis {
  categories: LegalCategory[];
  keywords: string[];
  sectionNumbers: string[];
  articleNumbers: string[];
  actNames: string[];
  hasSpecificLawReference: boolean;
}

const CATEGORY_TERMS: Record<LegalCategory, string[]> = {
  constitutional: ["constitution", "article", "fundamental right", "equality", "writ", "article 14", "article 21"],
  criminal: ["crime", "criminal", "theft", "murder", "assault", "punishment", "bail", "fir", "bns", "bharatiya nyaya sanhita"],
  criminal_procedure: ["arrest", "remand", "investigation", "charge sheet", "trial", "bnss", "criminal procedure"],
  evidence: ["evidence", "witness", "admissible", "burden of proof", "bsa"],
  civil: ["civil suit", "injunction", "limitation", "damages"],
  contract: ["contract", "agreement", "breach", "consideration", "indemnity", "offer", "acceptance"],
  property: ["property", "land", "rent", "lease", "tenant", "registration"],
  family: ["divorce", "marriage", "maintenance", "custody", "adoption", "alimony"],
  employment: ["employee", "employer", "workplace", "termination", "harassment", "discrimination"],
  labour: ["labour", "labor", "wages", "trade union", "industrial dispute", "worker"],
  consumer: ["consumer", "defect", "deficiency", "consumer court"],
  cyber: ["cyber", "online", "digital", "computer", "it act", "data", "hacking"],
  taxation: ["tax", "gst", "income tax", "assessment"],
  corporate: ["company", "director", "shareholder", "corporate", "llp"],
  intellectual_property: ["copyright", "trademark", "patent", "intellectual property"],
  environmental: ["environment", "pollution", "forest", "wildlife", "climate"],
  other: [],
};

const STOP_WORDS = new Set(["what", "is", "the", "a", "an", "of", "for", "in", "on", "to", "and", "can", "does", "with", "when", "how", "law", "india", "indian"]);

export function analyzeLegalQuery(question: string): QueryAnalysis {
  const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
  const sectionNumbers = [...normalized.matchAll(/\bsection\s+(\d+[a-z]?(?:\([^)]+\))?)/gi)].map((match) => match[1]);
  const articleNumbers = [...normalized.matchAll(/\barticle\s+(\d+[a-z]?(?:\([^)]+\))?)/gi)].map((match) => match[1]);
  const actNames = [...question.matchAll(/\b(?:the\s+)?([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,6}\s+Act|Bharatiya\s+(?:Nyaya|Nagarik\s+Suraksha|Sakshya)\s+Sanhita)\b/g)].map((match) => match[1]);
  const matches = LEGAL_CATEGORIES
    .map((category) => ({ category, score: CATEGORY_TERMS[category].filter((term) => normalized.includes(term)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const keywords = normalized.match(/[\p{L}\p{N}_-]+/gu)?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)).slice(0, 12) ?? [];

  return {
    categories: matches.map((item) => item.category),
    keywords: [...new Set([...keywords, ...sectionNumbers, ...articleNumbers])],
    sectionNumbers,
    articleNumbers,
    actNames,
    hasSpecificLawReference: sectionNumbers.length > 0 || articleNumbers.length > 0 || actNames.length > 0,
  };
}
