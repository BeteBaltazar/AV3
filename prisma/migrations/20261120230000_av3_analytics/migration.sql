ALTER TABLE "Equipamento"
  ADD COLUMN "valorEstimadoRecuperacao" DOUBLE PRECISION,
  ADD COLUMN "valorRecuperacaoReal" DOUBLE PRECISION;

ALTER TABLE "Equipamento"
  ADD CONSTRAINT "Equipamento_valorEstimadoRecuperacao_check"
    CHECK ("valorEstimadoRecuperacao" IS NULL OR
      ("valorEstimadoRecuperacao" >= 0 AND "valorEstimadoRecuperacao" NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision))),
  ADD CONSTRAINT "Equipamento_valorRecuperacaoReal_check"
    CHECK ("valorRecuperacaoReal" IS NULL OR
      ("valorRecuperacaoReal" >= 0 AND "valorRecuperacaoReal" NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)));

CREATE TABLE "HistoricoEstadoFisico" (
  "id" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  "dataHora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "estadoFisico" "EstadoFisico" NOT NULL,
  "justificativa" TEXT NOT NULL DEFAULT '',
  "responsavel" TEXT NOT NULL DEFAULT '',

  CONSTRAINT "HistoricoEstadoFisico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HistoricoEstadoFisico_equipamentoId_dataHora_idx"
  ON "HistoricoEstadoFisico"("equipamentoId", "dataHora");

ALTER TABLE "HistoricoEstadoFisico"
  ADD CONSTRAINT "HistoricoEstadoFisico_equipamentoId_fkey"
  FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ResultadoAnalise" (
  "id" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "dataInicio" TIMESTAMPTZ(3),
  "dataFim" TIMESTAMPTZ(3),
  "metodo" TEXT NOT NULL,
  "dadosUtilizados" JSONB NOT NULL,
  "resultado" JSONB NOT NULL,
  "observacoes" TEXT NOT NULL DEFAULT '',
  "realizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ResultadoAnalise_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResultadoAnalise_categoria_realizadoEm_idx"
  ON "ResultadoAnalise"("categoria", "realizadoEm");
