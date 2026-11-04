import {Request, Response} from "express";
import { AuthService } from "./auth.service";
import { AuthRequest } from "../../common/middleware/auth.middleware";

const authService = new AuthService();

export class AuthController{
    static requestPasswordReset = async (req: Request, res: Response) => {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "A valid email address is required" });
        }
        await authService.requestPasswordReset(email);
        return res.status(200).json({ message: "If an account exists for that email, a reset link has been sent." });
    };

    static resetPassword = async (req: Request, res: Response) => {
        const { token, password } = req.body ?? {};
        if (typeof token !== "string" || !token || typeof password !== "string" || password.length < 8) {
            return res.status(400).json({ message: "A valid token and password of at least 8 characters are required" });
        }
        await authService.resetPassword(token, password);
        return res.status(200).json({ message: "Password updated successfully" });
    };

    static ragister = async (req: Request, res:Response) => {
        const {email, password, fullName} = req.body;

        const result = await authService.register(
            email,
            password,
            fullName,
        );

        return res.status(201).json({
            user:{
                id: result.user.id,
                email: result.user.email,
                fullName: result.user.fullName,
                role: result.user.role,
            },
            token: result.token
        });
    };

    static login = async (req: Request, res:Response) => {
        const {email, password} = req.body;

        const result = await authService.login(
            email,
            password,
        );

        return res.status(200).json({
            user:{
                id:result.user.id,
                email: result.user.email,
                fullName: result.user.fullName,
                role: result.user.role,
            },
            token: result.token,
        });
    }
    static me = async (req: AuthRequest, res: Response) => {
  return res.status(200).json({
    user: req.user,
  });
};

}
