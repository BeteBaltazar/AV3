import "dotenv/config";
import {
  EstadoFisico,
  PapelUsuario,
  StatusLote,
  StatusRastreamento,
  TipoEquipamento,
} from "@prisma/client";
import { ValidadorCNPJ } from "../domain/validators/ValidadorCNPJ.js";
import { criarAplicacao } from "../integration/ComposicaoAplicacao.js";
import { createPrismaClient } from "./prisma.js";

async function importarDadosLegados(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL e obrigatoria para importar dados.");
  }
  const dataDirectory = process.env.GREENCODE_DATA_DIR ?? ".greencode";
  const application = criarAplicacao(dataDirectory);
  const repository = application.repositorio;
  const prisma = createPrismaClient(databaseUrl);
  const cnpjValidator = new ValidadorCNPJ();

  const organizations = repository
    .listarEntidades("organizacoes.json")
    .map((row) => {
      const cnpj = stringField(row, "cnpj");
      if (!cnpjValidator.validar(cnpj)) {
        throw new Error(`CNPJ invalido ao importar organizacao ${stringField(row, "id")}.`);
      }
      return {
        id: stringField(row, "id"),
        razaoSocial: stringField(row, "razaoSocial"),
        cnpj,
        cnpjNormalizado: cnpj.replace(/\D/g, ""),
        inscricaoEstadual: stringField(row, "inscricaoEstadual"),
        enderecoCompleto: stringField(row, "enderecoCompleto"),
        telefone: stringField(row, "telefone"),
        email: stringField(row, "email"),
        dataCadastro: dateField(row, "dataCadastro"),
        ativo: booleanField(row, "ativo"),
        contratoVigente: booleanField(row, "contratoVigente"),
      };
    });

  const contracts = repository.listarEntidades("contratos.json").map((row) => ({
    id: stringField(row, "id"),
    organizacaoId: stringField(row, "organizacaoId"),
    dataAssinatura: dateField(row, "dataAssinatura"),
    dataVencimento: dateField(row, "dataVencimento"),
    clausulas: stringField(row, "clausulas"),
    valorMensal: numberField(row, "valorMensal"),
    renovacaoAutomatica: booleanField(row, "renovacaoAutomatica"),
  }));

  const lots = repository.listarEntidades("lotes.json").map((row) => ({
    id: stringField(row, "id"),
    dataEntrada: dateField(row, "dataEntrada"),
    organizacaoId: stringField(row, "organizacaoId"),
    notaFiscal: stringField(row, "notaFiscal"),
    transportadora: stringField(row, "transportadora"),
    statusProcessamento: enumField(row, "statusProcessamento", Object.values(StatusLote)),
    observacoes: stringField(row, "observacoes"),
  }));

  const legacyEquipment = repository.listarEntidades("equipamentos.json");
  const equipment = legacyEquipment.map((row) => ({
    id: stringField(row, "id"),
    codigoBarrasInterno: stringField(row, "codigoBarrasInterno"),
    tipo: enumField(row, "tipo", Object.values(TipoEquipamento)),
    marca: stringField(row, "marca"),
    modelo: stringField(row, "modelo"),
    anoFabricacao: numberField(row, "anoFabricacao"),
    estadoFisico: enumField(row, "estadoFisico", Object.values(EstadoFisico)),
    pesoQuilogramas: numberField(row, "pesoQuilogramas"),
    loteId: optionalStringField(row, "loteId"),
    posicaoNoLote: numberField(row, "posicaoNoLote"),
    statusRastreamento: enumField(row, "statusRastreamento", Object.values(StatusRastreamento)),
  }));

  const movements = legacyEquipment.flatMap((row) => {
    const history = row.historicoMovimentacao;
    if (history === undefined) {
      return [];
    }
    if (!Array.isArray(history)) {
      throw new Error(`Historico de movimentacoes invalido para equipamento ${stringField(row, "id")}.`);
    }
    return history.map((item, index) => {
      const movement = recordValue(item, `historicoMovimentacao[${index}]`);
      return {
        id: stringField(movement, "id"),
        equipamentoId: stringField(row, "id"),
        dataHora: dateField(movement, "dataHora"),
        origem: stringField(movement, "origem"),
        destino: stringField(movement, "destino"),
        responsavel: stringField(movement, "responsavel"),
        observacao: stringField(movement, "observacao"),
      };
    });
  });

  const users = application.autenticacao.credenciais.map((credential) => {
    const role = enumValue(credential.papel, Object.values(PapelUsuario), `papel de ${credential.usuario}`);
    return {
      usuario: credential.usuario,
      senhaHash: credential.hashSenha,
      senhaSalt: credential.salt,
      hashScheme: "sha256-v1",
      papel: role,
      ultimoAcesso: credential.ultimoAcesso,
    };
  });
  const parameterRecord = repository.carregarEntidade(
    "parametros-globais.json",
    "parametros-globais",
  );
  const parameters = parameterRecord
    ? [{
        id: "parametros-globais",
        aliquotasImpostos: fractionRecord(parameterRecord, "aliquotasImpostos"),
        coeficienteDepreciacao: fractionField(parameterRecord, "coeficienteDepreciacao"),
      }]
    : [];

  try {
    await prisma.$connect();
    const counts = await prisma.$transaction(async (tx) => {
      const organizationsCreated = await tx.organizacao.createMany({
        data: organizations,
        skipDuplicates: true,
      });
      const contractsCreated = await tx.contrato.createMany({
        data: contracts,
        skipDuplicates: true,
      });
      const lotsCreated = await tx.lote.createMany({
        data: lots,
        skipDuplicates: true,
      });
      const equipmentCreated = await tx.equipamento.createMany({
        data: equipment,
        skipDuplicates: true,
      });
      const movementsCreated = await tx.movimentacao.createMany({
        data: movements,
        skipDuplicates: true,
      });
      const usersCreated = await tx.usuario.createMany({
        data: users,
        skipDuplicates: true,
      });
      const parametersCreated = await tx.parametrosGlobais.createMany({
        data: parameters,
        skipDuplicates: true,
      });
      return {
        organizations: organizationsCreated.count,
        contracts: contractsCreated.count,
        lots: lotsCreated.count,
        equipment: equipmentCreated.count,
        movements: movementsCreated.count,
        users: usersCreated.count,
        globalParameters: parametersCreated.count,
      };
    }, { timeout: 60_000 });

    console.info("Importacao concluida. Registros adicionados:", counts);
    console.info("As credenciais SHA-256 serao atualizadas para scrypt no primeiro login via API.");
  } finally {
    await prisma.$disconnect();
  }
}

function recordValue(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Registro invalido em ${name}.`);
  }
  const record: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    record[key] = fieldValue;
  }
  return record;
}

function stringField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Campo obrigatorio invalido: ${field}.`);
  }
  return value;
}

function optionalStringField(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Campo invalido: ${field}.`);
  }
  return value;
}

function numberField(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Campo numerico invalido: ${field}.`);
  }
  return value;
}

function fractionField(row: Record<string, unknown>, field: string): number {
  const value = numberField(row, field);
  if (value < 0 || value > 1) {
    throw new Error(`Fracao invalida ao importar: ${field}.`);
  }
  return value;
}

function fractionRecord(
  row: Record<string, unknown>,
  field: string,
): Record<string, number> {
  const value = row[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Configuracao invalida ao importar: ${field}.`);
  }
  const entries = Object.entries(value);
  return Object.fromEntries(
    entries.map(([name, item]) => {
      if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1) {
        throw new Error(`Aliquota invalida ao importar: ${name}.`);
      }
      return [name, item];
    }),
  );
}

function booleanField(row: Record<string, unknown>, field: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") {
    throw new Error(`Campo booleano invalido: ${field}.`);
  }
  return value;
}

function dateField(row: Record<string, unknown>, field: string): Date {
  const value = row[field];
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data invalida ao importar: ${field}.`);
  }
  return date;
}

function enumField<T extends string>(
  row: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  return enumValue(row[field], values, field);
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T {
  if (typeof value === "string") {
    const matched = values.find((candidate) => candidate === value);
    if (matched) {
      return matched;
    }
  }
  throw new Error(`Valor de enumeracao invalido: ${field}.`);
}

importarDadosLegados().catch((error: unknown) => {
  console.error("Falha ao importar os dados legados para o PostgreSQL.", error);
  process.exitCode = 1;
});
