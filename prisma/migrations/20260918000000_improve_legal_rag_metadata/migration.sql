ALTER TABLE "LegalDocument"
  ADD COLUMN "subcategory" TEXT,
  ADD COLUMN "documentType" TEXT,
  ADD COLUMN "effectiveDate" TIMESTAMP(3),
  ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'India';

ALTER TABLE "DocumentChunk"
  ADD COLUMN "sectionNumber" TEXT,
  ADD COLUMN "chapter" TEXT,
  ADD COLUMN "pageNumber" INTEGER;

CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
CREATE INDEX "DocumentChunk_sectionNumber_idx" ON "DocumentChunk"("sectionNumber");
