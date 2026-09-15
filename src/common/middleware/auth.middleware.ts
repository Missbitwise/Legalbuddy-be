import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../../generated/client/enums";
import prisma from "../../config/prisma";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName?: string | null;
    role: UserRole;
  };
}

export const restrictTo = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: Administrator privileges required",
      });
    }

    next();
  };
};

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
    const authHeader = req.headers.authorization;


    if (!authHeader) {
  return res.status(401).json({
    message: "Authorization token required",
  });
}

const [scheme, token] = authHeader.split(" ");

if (scheme !== "Bearer" || !token) {
  return res.status(401).json({
    message: "Invalid authorization format",
  });
}
try{
const decode = jwt.verify(
    token,
    process.env.JWT_SECRET!,
) as {
  id: string;
  role: UserRole;
};

const user = await prisma.user.findUnique({
  where: {
    id: decode.id,
  },
  select: {
    id: true,
    email: true,
    fullName: true,
    role: true,
  },
});

if (!user) {
  return res.status(401).json({
    message: "Account no longer exists",
  });
}


req.user = {
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
};

next();

} catch{
    return res.status(401).json({
              message: "Invalid or expired token",

    });

    
}




};