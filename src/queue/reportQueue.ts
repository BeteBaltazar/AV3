import PgBoss from "pg-boss";

export const REPORT_QUEUE_NAME = "greencode-relatorios";

export interface ReportTaskData {
  taskId: string;
  categoria: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL";
  formato: "JSON" | "CSV";
  dataInicio?: string;
  dataFim?: string;
}

export interface ReportQueuePublisher {
  enqueue(data: ReportTaskData, attempts: number): Promise<void>;
  close(): Promise<void>;
}

export async function createReportQueue(databaseUrl: string): Promise<ReportQueuePublisher> {
  const boss = new PgBoss({ connectionString: databaseUrl });
  try {
    await boss.start();
    await boss.createQueue(REPORT_QUEUE_NAME);
  } catch (error) {
    await boss.stop();
    throw error;
  }

  return {
    async enqueue(data, attempts) {
      const jobId = await boss.send(REPORT_QUEUE_NAME, data, {
        id: data.taskId,
        retryLimit: Math.max(attempts - 1, 0),
        retryDelay: 5,
        retryBackoff: true,
      });

      if (!jobId) {
        const existingJob = await boss.getJobById(
          REPORT_QUEUE_NAME,
          data.taskId,
          { includeArchive: true },
        );
        if (!existingJob) {
          throw new Error(`Nao foi possivel enfileirar a tarefa ${data.taskId}.`);
        }
      }
    },
    async close() {
      await boss.stop({ graceful: true, timeout: 30_000 });
    },
  };
}
