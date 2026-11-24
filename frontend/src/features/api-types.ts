import type { PapelUsuario } from '../auth/roles'

export interface UsuarioApi {
  id: string
  usuario: string
  papel: PapelUsuario
  version: number
}

export interface OrganizacaoApi {
  id: string
  razaoSocial: string
  cnpj: string
  inscricaoEstadual: string
  enderecoCompleto: string
  telefone: string
  email: string
  dataCadastro: string
  ativo: boolean
  contratoVigente: boolean
  version: number
}

export interface ContratoApi {
  id: string
  organizacaoId: string
  dataAssinatura: string
  dataVencimento: string
  clausulas: string
  valorMensal: number
  renovacaoAutomatica: boolean
  version: number
}

export const TIPOS_EQUIPAMENTO = [
  'COMPUTADOR_MESA',
  'NOTEBOOK',
  'MONITOR',
  'IMPRESSORA',
  'SERVIDOR',
  'ROTEADOR',
  'CABO_ESTRUTURADO',
  'FONTE_ALIMENTACAO',
] as const

export const ESTADOS_FISICOS = [
  'NOVO',
  'BOM_ESTADO',
  'USADO_LEVE',
  'USADO_MODERADO',
  'DANIFICADO_LEVE',
  'DANIFICADO_GRAVE',
  'INSERVIVEL',
] as const

export const STATUS_RASTREAMENTO = [
  'AGUARDANDO_TRIAGEM',
  'EM_TRIAGEM',
  'AGUARDANDO_DESMONTE',
  'EM_DESMONTE',
  'PECAS_REAPROVEITADAS',
  'MATERIAL_RECICLAVEL',
  'DESCARTE_SEGURO',
  'BAIXA_DEFINITIVA',
] as const

export type TipoEquipamentoApi = (typeof TIPOS_EQUIPAMENTO)[number]
export type EstadoFisicoApi = (typeof ESTADOS_FISICOS)[number]
export type StatusRastreamentoApi = (typeof STATUS_RASTREAMENTO)[number]

export interface EquipamentoApi {
  id: string
  codigoBarrasInterno: string
  tipo: TipoEquipamentoApi
  marca: string
  modelo: string
  anoFabricacao: number
  estadoFisico: EstadoFisicoApi
  pesoQuilogramas: number
  loteId: string | null
  posicaoNoLote: number
  statusRastreamento: StatusRastreamentoApi
  version: number
}

export interface LoteApi {
  id: string
  dataEntrada: string
  organizacaoId: string
  notaFiscal: string
  transportadora: string
  statusProcessamento: string
  observacoes: string
  version: number
  equipamentos: EquipamentoApi[]
}

export interface MovimentacaoApi {
  id: string
  equipamentoId: string
  dataHora: string
  origem: string
  destino: string
  responsavel: string
  observacao: string
}

export interface RastreamentoApi {
  equipamento: EquipamentoApi
  lote: LoteApi
  organizacao: OrganizacaoApi
  movimentacoes: MovimentacaoApi[]
}

export interface ParametrosApi {
  id: string
  aliquotasImpostos: Record<string, number>
  coeficienteDepreciacao: number
  version: number
}

export interface RelatorioOrganizacaoApi {
  organizacao: OrganizacaoApi
  lotes: LoteApi[]
}
