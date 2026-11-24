import "dotenv/config";
import { createApiApp } from "./app.js";
import { carregarConfiguracaoApi } from "./config.js";
import { createPrismaClient } from "./prisma.js";
import { PrismaGreencodeRepository } from "./repositories/PrismaGreencodeRepository.js";
import { createReportQueue } from "../queue/reportQueue.js";

async function iniciarServidor(): Promise<void> {
  const config = carregarConfiguracaoApi();
  const prisma = createPrismaClient(config.databaseUrl);
  let app: Awaited<ReturnType<typeof createApiApp>> | undefined;
  let reportQueue: Awaited<ReturnType<typeof createReportQueue>> | undefined;

  try {
    await prisma.$connect();
    reportQueue = await createReportQueue(config.databaseUrl);
    app = await createApiApp(new PrismaGreencodeRepository(prisma), {
      jwtSecret: config.jwtSecret,
      jwtExpiresIn: config.jwtExpiresIn,
      reportQueue,
    });
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`Greencode API disponivel em http://${config.host}:${config.port}`);

    const shutdown = async (signal: string) => {
      app?.log.info({ signal }, "Encerrando Greencode API");
      try {
        await app?.close();
      } finally {
        try {
          await reportQueue?.close();
        } finally {
          await prisma.$disconnect();
        }
      }
    };
    process.once("SIGINT", () => {
      void shutdown("SIGINT").catch(relatarFalhaEncerramento);
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM").catch(relatarFalhaEncerramento);
    });
  } catch (error) {
    try {
      await app?.close();
    } finally {
      try {
        await reportQueue?.close();
      } finally {
        await prisma.$disconnect();
      }
    }
    throw error;
  }
}

function relatarFalhaEncerramento(error: unknown): void {
  console.error("Falha durante o encerramento da Greencode API.", error);
  process.exitCode = 1;
}

iniciarServidor().catch((error: unknown) => {
  console.error("Nao foi possivel iniciar a Greencode API.", error);
  process.exitCode = 1;
});
