import { Request, Response } from "express";
import { legalService } from "./legal.service";
import { uploadDocumentSchema } from "./legal.validation";

export class LegalController {
  static uploadDocument = async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Please upload a PDF file",
      });
    }

    const parsed = uploadDocumentSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid legal document metadata",
        errors: parsed.error.issues,
      });
    }

    const document = await legalService.uploadDocument(
      parsed.data.body,
      req.file.buffer,
    );

    return res.status(201).json({
      document,
    });
  };
}
