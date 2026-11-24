ALTER TABLE "ResultadoAnalise"
  ADD COLUMN "parceiroId" TEXT,
  ADD COLUMN "organizacaoId" TEXT;

CREATE INDEX "ResultadoAnalise_parceiroId_realizadoEm_idx"
  ON "ResultadoAnalise"("parceiroId", "realizadoEm");
CREATE INDEX "ResultadoAnalise_organizacaoId_realizadoEm_idx"
  ON "ResultadoAnalise"("organizacaoId", "realizadoEm");
