-- Gemini's 3072-dimensional vectors cannot be compared to Cohere's 1024-dimensional vectors.
-- The original PDFs are not persisted by this application, so documents and chunks
-- must be re-created by re-uploading PDFs after this migration.
DELETE FROM "LegalDocument";

ALTER TABLE "DocumentChunk"
  ALTER COLUMN "embedding" TYPE vector(1024)
  USING NULL::vector(1024);
