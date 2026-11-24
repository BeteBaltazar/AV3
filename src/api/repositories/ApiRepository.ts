import type {
  Contrato,
  Equipamento,
  Lote,
  Movimentacao,
  Organizacao,
  ParametrosGlobais,
  ResultadoAnalise,
  Parceiro,
  ChaveApi,
  TarefaRelatorio,
  Prisma,
  Usuario,
} from "@prisma/client";
import type { EstadoFisico } from "../../domain/enums/EstadoFisico.js";
import type { PapelUsuario } from "../../domain/enums/PapelUsuario.js";
import type { StatusRastreamento } from "../../domain/enums/StatusRastreamento.js";
import type { TipoEquipamento } from "../../domain/enums/TipoEquipamento.js";
import type { StatusLote } from "../../domain/enums/StatusLote.js";

export type LoteComEquipamentos = Prisma.LoteGetPayload<{
  include: { equipamentos: true };
}>;

export type EquipamentoRastreavel = Prisma.EquipamentoGetPayload<{
  include: {
    lote: { include: { organizacao: true } };
    historicoMovimentacao: true;
  };
}>;
export type UsuarioPublico = Omit<Usuario, "senhaHash" | "senhaSalt" | "hashScheme">;

export interface NovaOrganizacao {
  id: string;
  razaoSocial: string;
  cnpj: string;
  cnpjNormalizado: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
  dataCadastro: Date;
}

export interface NovoContrato {
  id: string;
  organizacaoId: string;
  dataAssinatura: Date;
  dataVencimento: Date;
  clausulas: string;
  valorMensal: number;
  renovacaoAutomatica: boolean;
}

export interface AtualizacaoContrato {
  dataAssinatura?: Date;
  dataVencimento?: Date;
  clausulas?: string;
  valorMensal?: number;
  renovacaoAutomatica?: boolean;
}

export interface NovoEquipamento {
  id: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  valorEstimadoRecuperacao?: number;
  valorRecuperacaoReal?: number;
}

export interface AtualizacaoLote {
  notaFiscal?: string;
  transportadora?: string;
  observacoes?: string;
}

export interface NovoLote {
  id: string;
  dataEntrada: Date;
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  observacoes: string;
  equipamentos: NovoEquipamento[];
}

export interface NovoUsuario {
  usuario: string;
  senhaHash: string;
  senhaSalt: string;
  hashScheme: string;
  papel: PapelUsuario;
}

export interface NovoParceiro {
  nome: string;
  organizacaoId?: string;
  permissoes: string[];
  limiteRequisicoes: number;
  janelaLimiteSeg: number;
}

export type ChaveParceiro = ChaveApi & {
  parceiro: Parceiro;
};

export interface ApiRepository {
  findUserByUsername(usuario: string): Promise<Usuario | null>;
  findUserById(id: string): Promise<Usuario | null>;
  listUsers(): Promise<UsuarioPublico[]>;
  createUser(data: NovoUsuario): Promise<Usuario>;
  updateUser(
    id: string,
    expectedVersion: number,
    data: Prisma.UsuarioUpdateInput,
  ): Promise<Usuario>;
  deleteUser(id: string, expectedVersion: number): Promise<void>;

  createOrganization(data: NovaOrganizacao): Promise<Organizacao>;
  findOrganization(id: string): Promise<Organizacao | null>;
  listOrganizations(activeOnly: boolean): Promise<Organizacao[]>;
  deactivateOrganization(id: string, expectedVersion: number): Promise<Organizacao>;
  deleteOrganization(id: string, expectedVersion: number): Promise<void>;

  createContract(data: NovoContrato): Promise<Contrato>;
  findContract(id: string): Promise<Contrato | null>;
  listContractsByOrganization(organizationId: string): Promise<Contrato[]>;
  updateContract(
    id: string,
    expectedVersion: number,
    data: AtualizacaoContrato,
  ): Promise<Contrato>;
  deleteContract(id: string, expectedVersion: number): Promise<void>;
  renewContract(
    id: string,
    expectedVersion: number,
    dataVencimento: Date,
  ): Promise<Contrato>;

  createLotWithEquipment(data: NovoLote): Promise<LoteComEquipamentos>;
  addEquipmentToLot(
    lotId: string,
    expectedVersion: number,
    equipamentos: NovoEquipamento[],
  ): Promise<LoteComEquipamentos>;
  findLot(id: string): Promise<LoteComEquipamentos | null>;
  listLots(dataInicio?: Date, dataFim?: Date): Promise<LoteComEquipamentos[]>;
  updateLot(
    id: string,
    expectedVersion: number,
    data: AtualizacaoLote,
  ): Promise<LoteComEquipamentos>;
  deleteLot(id: string, expectedVersion: number): Promise<void>;
  triageLot(
    id: string,
    expectedVersion: number,
    equipmentVersions: Array<{ id: string; version: number }>,
    responsavel: string,
  ): Promise<LoteComEquipamentos>;

  findEquipment(id: string): Promise<Equipamento | null>;
  createEquipment(data: NovoEquipamento): Promise<Equipamento>;
  trackEquipment(id: string): Promise<EquipamentoRastreavel | null>;
  listEquipment(status?: StatusRastreamento): Promise<Equipamento[]>;
  unlinkEquipment(id: string, expectedVersion: number): Promise<Equipamento>;
  deleteEquipment(id: string, expectedVersion: number): Promise<void>;
  updatePhysicalState(
    id: string,
    expectedVersion: number,
    estadoFisico: EstadoFisico,
    justificativa?: string,
    responsavel?: string,
  ): Promise<Equipamento>;
  moveToDismantle(
    id: string,
    expectedVersion: number,
    responsavel: string,
  ): Promise<Equipamento>;

  getParameters(): Promise<ParametrosGlobais>;
  updateParameters(
    expectedVersion: number,
    data: Prisma.ParametrosGlobaisUpdateInput,
  ): Promise<ParametrosGlobais>;

  financialReport(dataInicio: Date, dataFim: Date): Promise<Contrato[]>;
  createMovement(data: Prisma.MovimentacaoCreateInput): Promise<Movimentacao>;

  getAnalyticsData(dataInicio?: Date, dataFim?: Date, organizacaoId?: string): Promise<{
    lotes: Prisma.LoteGetPayload<{
      include: { equipamentos: { include: { historicoMovimentacao: true } } };
    }>[];
    equipamentos: Prisma.EquipamentoGetPayload<{
      include: { historicoEstados: true };
    }>[];
  }>;
  saveAnalysis(data: {
    categoria: string;
    tarefaId?: string;
    dataInicio?: Date;
    dataFim?: Date;
    metodo: string;
    dadosUtilizados: object;
    resultado: object;
    observacoes: string;
    parceiroId?: string;
    organizacaoId?: string;
  }): Promise<ResultadoAnalise>;
  listAnalysisResults(categoria?: string, parceiroId?: string, organizacaoId?: string): Promise<ResultadoAnalise[]>;

  createPartner(data: NovoParceiro): Promise<Parceiro>;
  findApiKey(chaveHash: string): Promise<ChaveParceiro | null>;
  touchApiKey(id: string): Promise<void>;
  revokeApiKey(id: string): Promise<void>;
  generatePartnerKey(partnerId: string, chaveHash: string, prefixo: string): Promise<ChaveApi>;
  createReportTask(data: {
    parceiroId: string;
    organizacaoId?: string;
    categoria: string;
    formato: string;
    dadosEntrada: object;
  }): Promise<TarefaRelatorio>;
  findReportTask(id: string): Promise<TarefaRelatorio | null>;
  updateReportTask(
    id: string,
    data: Prisma.TarefaRelatorioUpdateInput,
  ): Promise<TarefaRelatorio>;
}
