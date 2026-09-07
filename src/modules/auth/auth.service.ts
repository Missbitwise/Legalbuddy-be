import bcrypt from "bcrypt";
import prisma from "../../config/prisma";
import jwt from "jsonwebtoken";
import { error } from "console";
import { AppError } from "../../common/errors/app-error";

export class AuthService {
  async register(email: string, password: string, fullName?: string) {
      // 1. Check existing user
const existingUser = await prisma.user.findUnique({
    where:{
        email,
    },
});
if(existingUser){
     throw new Error("Email already registered");
}
  // 2. Hash password
const passwordHash = await bcrypt.hash(password, 12);

  // 3. Create user
const user = await prisma.user.create({
    data:{
        email,
        passwordHash,
        fullName

    },
});

const token = jwt.sign(
    {
    id: user.id,
    role: user.role,
},
process.env.JWT_SECRET!,
{
    expiresIn: "7d"
}
);

return {
  user,
  token,
};


  }
  async login (email: string, password:string){
    //1find user by email
    const user = await prisma.user.findUnique({
        where: {
            email,
        },
    });
    if(!user){
        throw new AppError("Invalid email or password", 401)
    }

    //compare entered password with stored hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if(!isPasswordValid){
        throw new AppError("Invalid email or password", 401)
    };

    //genarate gwt
    const token =jwt.sign(
        {
            id: user.id,
            role: user.role,
        },
        process.env.JWT_SECRET!,
        {
            expiresIn: "7d",
        },
    );

    return {
        user,
        token
    };
  }

}


