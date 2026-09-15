import { Router } from "express";
import { LegalController } from "./legal.controller";
import { upload } from "../../config/multer";
import { authMiddleware, restrictTo } from "../../common/middleware/auth.middleware";

const router = Router();

router.post(
  "/upload",
  authMiddleware,
  restrictTo("ADMIN"),
  upload.single("file"),
  LegalController.uploadDocument,
);

export default router;