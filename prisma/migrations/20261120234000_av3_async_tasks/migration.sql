CREATE TABLE "TarefaRelatorio" (
  "id" TEXT NOT NULL,
  "parceiroId" TEXT NOT NULL,
  "organizacaoId" TEXT,
  "categoria" TEXT NOT NULL,
  "formato" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "tentativasMax" INTEGER NOT NULL DEFAULT 3,
  "dadosEntrada" JSONB NOT NULL,
  "arquivoUrl" TEXT,
  "ultimaFalha" TEXT,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "iniciadoEm" TIMESTAMPTZ(3),
  "concluidoEm" TIMESTAMPTZ(3),

  CONSTRAINT "TarefaRelatorio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TarefaRelatorio_categoria_check"
    CHECK ("categoria" IN ('EFICIENCIA_OPERACIONAL', 'RENTABILIDADE', 'VIDA_UTIL')),
  CONSTRAINT "TarefaRelatorio_formato_check" CHECK ("formato" IN ('JSON', 'CSV')),
  CONSTRAINT "TarefaRelatorio_status_check"
    CHECK ("status" IN ('AGUARDANDO_PROCESSAMENTO', 'EM_PROCESSAMENTO', 'CONCLUIDA', 'FALHOU')),
  CONSTRAINT "TarefaRelatorio_tentativas_check" CHECK ("tentativas" >= 0),
  CONSTRAINT "TarefaRelatorio_tentativasMax_check" CHECK ("tentativasMax" >= 1),
  CONSTRAINT "TarefaRelatorio_parceiroId_fkey"
    FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TarefaRelatorio_parceiroId_criadoEm_idx"
  ON "TarefaRelatorio"("parceiroId", "criadoEm");
CREATE INDEX "TarefaRelatorio_status_criadoEm_idx"
  ON "TarefaRelatorio"("status", "criadoEm");
