import "dotenv/config";
import {
  EstadoFisico,
  PapelUsuario,
  PrismaClient,
  StatusLote,
  StatusRastreamento,
  TipoEquipamento,
} from "@prisma/client";
import { createPrismaClient } from "../src/api/prisma.js";
import { hashPassword } from "../src/api/passwords.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL e obrigatoria para executar o seed.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("O seed demonstrativo nao pode ser executado em producao.");
}
const prisma: PrismaClient = createPrismaClient(databaseUrl);

async function seed(): Promise<void> {
  const adminUsername = process.env.GREENCODE_ADMIN_USERNAME?.trim();
  const adminPassword = process.env.GREENCODE_ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    throw new Error("Defina GREENCODE_ADMIN_USERNAME e GREENCODE_ADMIN_PASSWORD para criar o usuario administrador local.");
  }

  const now = new Date();
  const entrada = new Date(now);
  entrada.setDate(entrada.getDate() - 10);
  const vencimento = new Date(now);
  vencimento.setFullYear(vencimento.getFullYear() + 1);
  const organizationId = "greencode-seed-org";
  const triagedLotId = "greencode-seed-triaged-lot";
  const receivedLotId = "greencode-seed-received-lot";
  const organization = await prisma.organizacao.upsert({
    where: { id: organizationId },
    create: {
      id: organizationId,
      razaoSocial: "Organizacao de demonstracao Greencode",
      cnpj: "04.252.011/0001-10",
      cnpjNormalizado: "04252011000110",
      inscricaoEstadual: "ISENTO",
      enderecoCompleto: "Endereco de demonstracao",
      telefone: "0000000000",
      email: "demo@example.invalid",
      contratoVigente: true,
    },
    update: {
      razaoSocial: "Organizacao de demonstracao Greencode",
      cnpj: "04.252.011/0001-10",
      cnpjNormalizado: "04252011000110",
      ativo: true,
      contratoVigente: true,
    },
  });

  await prisma.contrato.upsert({
    where: { organizacaoId: organization.id },
    create: {
      id: "greencode-seed-contract",
      organizacaoId: organization.id,
      dataAssinatura: entrada,
      dataVencimento: vencimento,
      clausulas: "Contrato ficticio para desenvolvimento e testes.",
      valorMensal: 0,
      renovacaoAutomatica: false,
    },
    update: {
      dataAssinatura: entrada,
      dataVencimento: vencimento,
      clausulas: "Contrato ficticio para desenvolvimento e testes.",
      valorMensal: 0,
      renovacaoAutomatica: false,
    },
  });
  for (const lot of [
    { id: triagedLotId, statusProcessamento: StatusLote.TRIAGEM_CONCLUIDA, notaFiscal: "NF-DEMO-001" },
    { id: receivedLotId, statusProcessamento: StatusLote.RECEBIDO, notaFiscal: "NF-DEMO-002" },
  ]) {
    await prisma.lote.upsert({
      where: { id: lot.id },
      create: {
        id: lot.id,
        dataEntrada: entrada,
        organizacaoId: organization.id,
        notaFiscal: lot.notaFiscal,
        transportadora: "Transportadora demonstrativa",
        statusProcessamento: lot.statusProcessamento,
        observacoes: "Massa de dados local de desenvolvimento.",
      },
      update: {
        dataEntrada: entrada,
        organizacaoId: organization.id,
        notaFiscal: lot.notaFiscal,
        transportadora: "Transportadora demonstrativa",
        statusProcessamento: lot.statusProcessamento,
        observacoes: "Massa de dados local de desenvolvimento.",
      },
    });
  }

  const equipmentCases = [
    {
      id: "greencode-seed-eq-1",
      codigoBarrasInterno: "DEMO-NOTEBOOK-0001",
      tipo: TipoEquipamento.NOTEBOOK,
      marca: "Marca demonstrativa",
      modelo: "Modelo A",
      anoFabricacao: 2022,
      estadoFisico: EstadoFisico.BOM_ESTADO,
      pesoQuilogramas: 2.1,
      statusRastreamento: StatusRastreamento.AGUARDANDO_DESMONTE,
      posicaoNoLote: 1,
      loteId: triagedLotId,
      movimentacoes: ["TRIAGEM"],
    },
    {
      id: "greencode-seed-eq-2",
      codigoBarrasInterno: "DEMO-MONITOR-0002",
      tipo: TipoEquipamento.MONITOR,
      marca: "Marca demonstrativa",
      modelo: "Modelo B",
      anoFabricacao: 2019,
      estadoFisico: EstadoFisico.DANIFICADO_LEVE,
      pesoQuilogramas: 4.5,
      statusRastreamento: StatusRastreamento.EM_DESMONTE,
      posicaoNoLote: 2,
      loteId: triagedLotId,
      movimentacoes: ["TRIAGEM", "DESMONTE"],
    },
    {
      id: "greencode-seed-eq-3",
      codigoBarrasInterno: "DEMO-ROTEADOR-0003",
      tipo: TipoEquipamento.ROTEADOR,
      marca: "Marca demonstrativa",
      modelo: "Modelo C",
      anoFabricacao: 2024,
      estadoFisico: EstadoFisico.NOVO,
      pesoQuilogramas: 0.7,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
      posicaoNoLote: 1,
      loteId: receivedLotId,
      movimentacoes: [],
    },
  ] as const;

  for (const equipment of equipmentCases) {
    const { loteId, movimentacoes, ...equipmentData } = equipment;
    await prisma.equipamento.upsert({
      where: { id: equipment.id },
      create: {
        ...equipmentData,
        loteId,
      },
      update: {
        ...equipmentData,
        loteId,
      },
    });
    for (const [index, destino] of movimentacoes.entries()) {
      await prisma.movimentacao.upsert({
        where: { id: `${equipment.id}-movement-${index + 1}` },
        create: {
          id: `${equipment.id}-movement-${index + 1}`,
          equipamentoId: equipment.id,
          dataHora: new Date(entrada.getTime() + index * 1000),
          origem: index === 0 ? "ORIGEM" : movimentacoes[index - 1] ?? "ORIGEM",
          destino,
          responsavel: "seed",
          observacao: "Movimentacao ficticia de desenvolvimento.",
        },
        update: {
          equipamentoId: equipment.id,
          dataHora: new Date(entrada.getTime() + index * 1000),
          origem: index === 0 ? "ORIGEM" : movimentacoes[index - 1] ?? "ORIGEM",
          destino,
          responsavel: "seed",
        },
      });
    }
  }

  await prisma.parametrosGlobais.upsert({
    where: { id: "parametros-globais" },
    create: {
      id: "parametros-globais",
      aliquotasImpostos: { ICMS: 0.18 },
      coeficienteDepreciacao: 0.08,
    },
    update: {
      aliquotasImpostos: { ICMS: 0.18 },
      coeficienteDepreciacao: 0.08,
    },
  });

  const password = await hashPassword(adminPassword);
  await prisma.usuario.createMany({
    data: [{
      usuario: adminUsername,
      ...password,
      papel: PapelUsuario.ADMINISTRADOR,
    }],
    skipDuplicates: true,
  });

  console.info("Seed Greencode aplicado com dados exclusivamente demonstrativos.");
}

seed()
  .catch((error: unknown) => {
    console.error("Falha ao executar o seed Greencode.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
