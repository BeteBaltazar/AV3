import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import PgBoss from "pg-boss";
import { Prisma } from "@prisma/client";
import { createPrismaClient } from "../api/prisma.js";
import { PrismaGreencodeRepository } from "../api/repositories/PrismaGreencodeRepository.js";
import {
  analisarEficiencia,
  analisarRentabilidade,
  analisarVidaUtil,
  type SnapshotEquipamentoAnalitico,
  type SnapshotLoteAnalitico,
} from "../analysis/Analises.js";
import {
  REPORT_QUEUE_NAME,
  type ReportTaskData,
} from "./reportQueue.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL e obrigatoria para iniciar o worker.");
}
const requiredDatabaseUrl = databaseUrl;

const outputDir = process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), "reports");
const concurrency = Number(process.env.REPORT_WORKER_CONCURRENCY ?? "2");
if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error("REPORT_WORKER_CONCURRENCY deve ser um inteiro positivo.");
}

const prisma = createPrismaClient(databaseUrl);
const repository = new PrismaGreencodeRepository(prisma);

async function processReport(job: PgBoss.JobWithMetadata<ReportTaskData>) {
  const task = await repository.findReportTask(job.data.taskId);
  if (!task) {
    throw new Error("Tarefa nao encontrada.");
  }
  if (task.status === "CONCLUIDA") {
    return { taskId: task.id, arquivoUrl: task.arquivoUrl };
  }

  const attempt = job.retryCount + 1;
  try {
    await repository.updateReportTask(task.id, {
      status: "EM_PROCESSAMENTO",
      tentativas: attempt,
      iniciadoEm: new Date(),
      ultimaFalha: null,
    });

    const dataInicio = job.data.dataInicio ? new Date(job.data.dataInicio) : undefined;
    const dataFim = job.data.dataFim ? new Date(job.data.dataFim) : undefined;
    const snapshot = await repository.getAnalyticsData(
      dataInicio,
      dataFim,
      task.organizacaoId ?? undefined,
    );
    let result: unknown;
    let persistResult: Prisma.JsonObject;
    if (job.data.categoria === "EFICIENCIA_OPERACIONAL") {
      result = analisarEficiencia(snapshot.lotes as unknown as SnapshotLoteAnalitico[]);
      persistResult = result as Prisma.JsonObject;
    } else if (job.data.categoria === "RENTABILIDADE") {
      result = analisarRentabilidade(snapshot.equipamentos as unknown as SnapshotEquipamentoAnalitico[]);
      persistResult = result as Prisma.JsonObject;
    } else {
      result = analisarVidaUtil(snapshot.equipamentos as unknown as SnapshotEquipamentoAnalitico[]);
      persistResult = result as Prisma.JsonObject;
    }
    await repository.saveAnalysis({
      tarefaId: task.id,
      categoria: job.data.categoria,
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      metodo: typeof result === "object" && result && "metodo" in result
        ? String((result as { metodo: string }).metodo)
        : job.data.categoria,
      dadosUtilizados: { tarefaId: task.id },
      resultado: persistResult,
      observacoes: "Resultado gerado por processamento assincrono.",
      parceiroId: task.parceiroId,
      ...(task.organizacaoId ? { organizacaoId: task.organizacaoId } : {}),
    });
    await mkdir(outputDir, { recursive: true });
    const extension = job.data.formato === "CSV" ? "csv" : "json";
    const fileName = `${task.id}.${extension}`;
    const filePath = join(outputDir, fileName);
    await writeFile(
      filePath,
      job.data.formato === "CSV"
        ? gerarCsv(result)
        : JSON.stringify(result, null, 2),
      "utf8",
    );
    await repository.updateReportTask(task.id, {
      status: "CONCLUIDA",
      arquivoUrl: `/api/v1/public/tarefas/${task.id}/download`,
      concluidoEm: new Date(),
      ultimaFalha: null,
    });
    return { taskId: task.id, fileName };
  } catch (error) {
    await repository.updateReportTask(task.id, {
      status: job.retryCount >= job.retryLimit ? "FALHOU" : "AGUARDANDO_PROCESSAMENTO",
      tentativas: attempt,
      ultimaFalha: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function startWorker(): Promise<void> {
  const boss = new PgBoss({ connectionString: requiredDatabaseUrl });
  let stopping = false;
  let started = false;

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`Encerrando worker de relatorios (${signal}).`);
    try {
      if (started) await boss.stop({ graceful: true, timeout: 30_000 });
    } finally {
      await prisma.$disconnect();
    }
  };
  const handleSignal = (signal: string) => {
    void shutdown(signal).catch((error: unknown) => {
      console.error("Falha ao encerrar worker de relatorios.", error);
      process.exitCode = 1;
    });
  };

  boss.on("error", (error) => {
    console.error("Erro na fila PostgreSQL de relatorios.", error);
  });

  try {
    await prisma.$connect();
    await boss.start();
    started = true;
    await boss.createQueue(REPORT_QUEUE_NAME);
    await Promise.all(Array.from({ length: concurrency }, () =>
      boss.work<ReportTaskData>(
        REPORT_QUEUE_NAME,
        { batchSize: 1, includeMetadata: true },
        async (jobs) => {
          const job = jobs[0];
          if (job) await processReport(job);
        },
      ),
    ));
    process.once("SIGINT", () => handleSignal("SIGINT"));
    process.once("SIGTERM", () => handleSignal("SIGTERM"));
    console.info(`Worker de relatorios pronto (${concurrency} consumidores).`);
  } catch (error) {
    try {
      if (started) await boss.stop();
    } finally {
      await prisma.$disconnect();
    }
    throw error;
  }
}

function gerarCsv(value: unknown): string {
  if (Array.isArray(value)) {
    return criarCsv(value);
  }
  if (typeof value === "object" && value !== null) {
    const flattened = flattenObject(value as Record<string, unknown>);
    return criarCsv([flattened]);
  }
  return "resultado\n" + JSON.stringify(value).replace(/"/g, '""') + "\n";
}

function criarCsv(rows: unknown[]): string {
  if (rows.length === 0) return "";
  const objects = rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => flattenObject(row));
  const columns = [...new Set(objects.flatMap((row) => Object.keys(row)))];
  const escape = (item: unknown) => `"${String(item ?? "").replace(/"/g, '""')}"`;
  return [
    columns.map(escape).join(","),
    ...objects.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
}

function flattenObject(value: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      Object.assign(result, flattenObject(item as Record<string, unknown>, name));
    } else {
      result[name] = Array.isArray(item) ? JSON.stringify(item) : item;
    }
  }
  return result;
}

startWorker().catch((error: unknown) => {
  console.error("Nao foi possivel iniciar o worker de relatorios.", error);
  process.exitCode = 1;
});
