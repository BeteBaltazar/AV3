-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMINISTRADOR', 'OPERADOR_CADASTRO', 'GESTOR_ALMOXARIFADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('NOVO', 'BOM_ESTADO', 'USADO_LEVE', 'USADO_MODERADO', 'DANIFICADO_LEVE', 'DANIFICADO_GRAVE', 'INSERVIVEL');

-- CreateEnum
CREATE TYPE "StatusRastreamento" AS ENUM ('AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE', 'EM_DESMONTE', 'PECAS_REAPROVEITADAS', 'MATERIAL_RECICLAVEL', 'DESCARTE_SEGURO', 'BAIXA_DEFINITIVA');

-- CreateEnum
CREATE TYPE "StatusLote" AS ENUM ('RECEBIDO', 'EM_TRIAGEM', 'TRIAGEM_CONCLUIDA', 'ENCAMINHADO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "TipoEquipamento" AS ENUM ('COMPUTADOR_MESA', 'NOTEBOOK', 'MONITOR', 'IMPRESSORA', 'SERVIDOR', 'ROTEADOR', 'CABO_ESTRUTURADO', 'FONTE_ALIMENTACAO');

-- CreateTable
CREATE TABLE "Organizacao" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "cnpjNormalizado" TEXT NOT NULL,
    "inscricaoEstadual" TEXT NOT NULL,
    "enderecoCompleto" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dataCadastro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "contratoVigente" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMPTZ(3) NOT NULL,
    "dataVencimento" TIMESTAMPTZ(3) NOT NULL,
    "clausulas" TEXT NOT NULL,
    "valorMensal" DOUBLE PRECISION NOT NULL,
    "renovacaoAutomatica" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" TEXT NOT NULL,
    "dataEntrada" TIMESTAMPTZ(3) NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "notaFiscal" TEXT NOT NULL,
    "transportadora" TEXT NOT NULL,
    "statusProcessamento" "StatusLote" NOT NULL DEFAULT 'RECEBIDO',
    "observacoes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" TEXT NOT NULL,
    "codigoBarrasInterno" TEXT NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anoFabricacao" INTEGER NOT NULL,
    "estadoFisico" "EstadoFisico" NOT NULL DEFAULT 'NOVO',
    "pesoQuilogramas" DOUBLE PRECISION NOT NULL,
    "loteId" TEXT,
    "posicaoNoLote" INTEGER NOT NULL DEFAULT 0,
    "statusRastreamento" "StatusRastreamento" NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimentacao" (
    "id" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "dataHora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "observacao" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Movimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "senhaSalt" TEXT NOT NULL,
    "hashScheme" TEXT NOT NULL DEFAULT 'scrypt-v1',
    "papel" "PapelUsuario" NOT NULL,
    "ultimoAcesso" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametrosGlobais" (
    "id" TEXT NOT NULL DEFAULT 'parametros-globais',
    "aliquotasImpostos" JSONB NOT NULL DEFAULT '{}',
    "coeficienteDepreciacao" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ParametrosGlobais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizacao_cnpjNormalizado_key" ON "Organizacao"("cnpjNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_organizacaoId_key" ON "Contrato"("organizacaoId");

-- CreateIndex
CREATE INDEX "Lote_organizacaoId_dataEntrada_idx" ON "Lote"("organizacaoId", "dataEntrada");

-- CreateIndex
CREATE UNIQUE INDEX "Equipamento_codigoBarrasInterno_key" ON "Equipamento"("codigoBarrasInterno");

-- CreateIndex
CREATE INDEX "Equipamento_loteId_posicaoNoLote_idx" ON "Equipamento"("loteId", "posicaoNoLote");

-- CreateIndex
CREATE INDEX "Equipamento_statusRastreamento_idx" ON "Equipamento"("statusRastreamento");

-- CreateIndex
CREATE INDEX "Movimentacao_equipamentoId_dataHora_idx" ON "Movimentacao"("equipamentoId", "dataHora");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimentacao" ADD CONSTRAINT "Movimentacao_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints for values that Prisma's schema language cannot express.
ALTER TABLE "Organizacao"
  ADD CONSTRAINT "Organizacao_cnpjNormalizado_check" CHECK ("cnpjNormalizado" ~ '^[0-9]{14}$'),
  ADD CONSTRAINT "Organizacao_version_check" CHECK ("version" >= 1);

ALTER TABLE "Contrato"
  ADD CONSTRAINT "Contrato_dataVencimento_check" CHECK ("dataVencimento" >= "dataAssinatura"),
  ADD CONSTRAINT "Contrato_valorMensal_check" CHECK (
    "valorMensal" >= 0
    AND "valorMensal" NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ),
  ADD CONSTRAINT "Contrato_version_check" CHECK ("version" >= 1);

ALTER TABLE "Lote"
  ADD CONSTRAINT "Lote_version_check" CHECK ("version" >= 1);

ALTER TABLE "Equipamento"
  ADD CONSTRAINT "Equipamento_anoFabricacao_check" CHECK ("anoFabricacao" >= 1),
  ADD CONSTRAINT "Equipamento_pesoQuilogramas_check" CHECK (
    "pesoQuilogramas" >= 0
    AND "pesoQuilogramas" NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ),
  ADD CONSTRAINT "Equipamento_posicaoNoLote_check" CHECK ("posicaoNoLote" >= 0),
  ADD CONSTRAINT "Equipamento_version_check" CHECK ("version" >= 1);

ALTER TABLE "Movimentacao"
  ADD CONSTRAINT "Movimentacao_version_check" CHECK ("version" >= 1);

ALTER TABLE "Usuario"
  ADD CONSTRAINT "Usuario_usuario_check" CHECK (length(btrim("usuario")) > 0),
  ADD CONSTRAINT "Usuario_hashScheme_check" CHECK ("hashScheme" IN ('scrypt-v1', 'sha256-v1')),
  ADD CONSTRAINT "Usuario_version_check" CHECK ("version" >= 1);

ALTER TABLE "ParametrosGlobais"
  ADD CONSTRAINT "ParametrosGlobais_aliquotasImpostos_check" CHECK (jsonb_typeof("aliquotasImpostos") = 'object'),
  ADD CONSTRAINT "ParametrosGlobais_coeficienteDepreciacao_check" CHECK ("coeficienteDepreciacao" BETWEEN 0 AND 1),
  ADD CONSTRAINT "ParametrosGlobais_version_check" CHECK ("version" >= 1);
