import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Borra todo en productos
  const deleted = await prisma.producto.deleteMany({});
  console.log("Productos eliminados:", deleted.count);
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
