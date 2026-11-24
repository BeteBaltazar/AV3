ALTER TABLE "ResultadoAnalise"
ADD COLUMN "tarefaId" TEXT;

CREATE UNIQUE INDEX "ResultadoAnalise_tarefaId_key"
ON "ResultadoAnalise"("tarefaId");

ALTER TABLE "ResultadoAnalise"
ADD CONSTRAINT "ResultadoAnalise_tarefaId_fkey"
FOREIGN KEY ("tarefaId") REFERENCES "TarefaRelatorio"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
