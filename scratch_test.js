
import { PrismaClient } from "./src/generated/client/index.js";
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.documentChunk.count();
  console.log("Total chunks in DB:", count);
  const chunks = await prisma.documentChunk.findMany({ take: 3 });
  chunks.forEach(c => console.log("Preview:", c.content.substring(0, 100).replace(/\n/g, " ")));
}
main().finally(() => prisma.$disconnect());

