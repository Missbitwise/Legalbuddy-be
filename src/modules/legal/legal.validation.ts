import { z } from "zod";

export const uploadDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    category: z.string().min(1, "Category is required"),
    subcategory: z.string().min(1).optional(),
    documentType: z.string().min(1).optional(),
    version: z.string().optional(),
    effectiveDate: z.coerce.date().optional(),
    sourceUrl: z.string().url("Invalid URL").optional(),
    jurisdiction: z.string().min(1).optional(),
  }),
});

export type UploadDocumentBody =
  z.infer<typeof uploadDocumentSchema>["body"];
