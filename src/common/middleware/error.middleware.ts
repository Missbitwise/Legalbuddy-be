import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import logger from "../logger";

export const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error({ error, path: req.path, method: req.method }, "Unhandled error");

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  return res.status(500).json({
    message: "Internal server error",
  });
};
