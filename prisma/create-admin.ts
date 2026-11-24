import "dotenv/config";
import { PapelUsuario, Prisma, PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/api/prisma.js";
import { hashPassword } from "../src/api/passwords.js";

async function createInitialAdmin(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const username = process.env.GREENCODE_ADMIN_USERNAME?.trim();
  const password = process.env.GREENCODE_ADMIN_PASSWORD;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL e obrigatoria para criar o administrador inicial.");
  }
  if (!username || !password?.trim()) {
    throw new Error(
      "Defina GREENCODE_ADMIN_USERNAME e GREENCODE_ADMIN_PASSWORD no .env.",
    );
  }

  const prisma: PrismaClient = createPrismaClient(databaseUrl);
  try {
    const credentials = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const userCount = await tx.usuario.count();
      if (userCount > 0) {
        throw new Error(
          "Ja existe usuario no banco. O administrador inicial so pode ser criado quando a tabela Usuario estiver vazia.",
        );
      }

      await tx.usuario.create({
        data: {
          usuario: username,
          ...credentials,
          papel: PapelUsuario.ADMINISTRADOR,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    console.info(`Administrador inicial "${username}" criado com sucesso.`);
  } finally {
    await prisma.$disconnect();
  }
}

createInitialAdmin().catch((error: unknown) => {
  console.error(
    "Nao foi possivel criar o administrador inicial.",
    error instanceof Error ? error.message : "Erro desconhecido.",
  );
  process.exitCode = 1;
});
