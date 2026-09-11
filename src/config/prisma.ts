import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client";
import logger from "../common/logger";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  logger.warn({ err: err.message }, "Unexpected error on idle PostgreSQL pool client");
});

const adapter = new PrismaPg(pool);

const basePrisma = new PrismaClient({
  adapter,
});

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (error: any) {
          const isConnectionError =
            error?.code === "P1017" ||
            error?.message?.includes("Server has closed the connection") ||
            error?.message?.includes("ConnectionClosed") ||
            error?.message?.includes("connection closed");

          if (isConnectionError) {
            logger.warn(
              { model, operation, err: error.message },
              "Prisma connection closed, retrying operation once..."
            );
            return await query(args);
          }
          throw error;
        }
      },
    },
  },
});

export default prisma;