-- Previous 1024-dimensional vectors cannot be compared with local BGE vectors
-- (384 dimensions). Source PDFs are not persisted, so remove only derived chunks;
-- document metadata remains available and PDFs can be uploaded again for indexing.
DELETE FROM "DocumentChunk";

ALTER TABLE "DocumentChunk"
  ALTER COLUMN "embedding" TYPE vector(384)
  USING NULL::vector(384);
