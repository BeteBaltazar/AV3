CREATE TABLE "Parceiro" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "organizacaoId" TEXT,
  "permissoes" JSONB NOT NULL DEFAULT '[]',
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "limiteRequisicoes" INTEGER NOT NULL DEFAULT 100,
  "janelaLimiteSeg" INTEGER NOT NULL DEFAULT 60,
  "dataCadastro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Parceiro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Parceiro_nome_check" CHECK (length(btrim("nome")) > 0),
  CONSTRAINT "Parceiro_limiteRequisicoes_check" CHECK ("limiteRequisicoes" > 0),
  CONSTRAINT "Parceiro_janelaLimiteSeg_check" CHECK ("janelaLimiteSeg" > 0)
);

CREATE TABLE "ChaveApi" (
  "id" TEXT NOT NULL,
  "parceiroId" TEXT NOT NULL,
  "chaveHash" TEXT NOT NULL,
  "prefixo" TEXT NOT NULL,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "ultimoUso" TIMESTAMPTZ(3),
  "revogadaEm" TIMESTAMPTZ(3),
  "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChaveApi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChaveApi_chaveHash_key" UNIQUE ("chaveHash"),
  CONSTRAINT "ChaveApi_chaveHash_check" CHECK (length("chaveHash") = 64),
  CONSTRAINT "ChaveApi_prefixo_check" CHECK (length("prefixo") > 0),
  CONSTRAINT "ChaveApi_parceiroId_fkey"
    FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Parceiro_ativo_idx" ON "Parceiro"("ativo");
CREATE INDEX "ChaveApi_parceiroId_ativa_idx" ON "ChaveApi"("parceiroId", "ativa");
CREATE INDEX "ChaveApi_prefixo_idx" ON "ChaveApi"("prefixo");

ALTER TABLE "Parceiro"
  ADD CONSTRAINT "Parceiro_organizacaoId_fkey"
  FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
