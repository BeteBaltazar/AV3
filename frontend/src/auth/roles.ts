export const PAPEIS_USUARIO = [
  'ADMINISTRADOR',
  'OPERADOR_CADASTRO',
  'GESTOR_ALMOXARIFADO',
  'AUDITOR',
] as const

export type PapelUsuario = (typeof PAPEIS_USUARIO)[number]

export interface OpcaoAcesso {
  id: FeatureId
  titulo: string
  descricao: string
}

export type FeatureId =
  | 'usuarios'
  | 'organizacoes'
  | 'contratos'
  | 'lotes'
  | 'equipamentos'
  | 'rastreamento'
  | 'relatorios'
  | 'parametros'

const opcoesPorPapel: Record<PapelUsuario, readonly OpcaoAcesso[]> = {
  ADMINISTRADOR: [
    { id: 'usuarios', titulo: 'Contas de acesso', descricao: 'Gerenciamento de usuários e papéis.' },
    { id: 'parametros', titulo: 'Parâmetros globais', descricao: 'Alíquotas e depreciação.' },
    { id: 'organizacoes', titulo: 'Organizações', descricao: 'Consulta, cadastro e administração cadastral.' },
    { id: 'contratos', titulo: 'Contratos', descricao: 'Criação, consulta e renovação de contratos.' },
    { id: 'lotes', titulo: 'Lotes', descricao: 'Recebimento, triagem e consulta de lotes.' },
    { id: 'equipamentos', titulo: 'Equipamentos', descricao: 'Estado físico, desmonte e códigos de barras.' },
    { id: 'rastreamento', titulo: 'Rastreabilidade', descricao: 'Histórico completo por equipamento.' },
    { id: 'relatorios', titulo: 'Relatórios', descricao: 'Consultas e acompanhamento da operação.' },
  ],
  OPERADOR_CADASTRO: [
    { id: 'organizacoes', titulo: 'Organizações', descricao: 'Cadastro e consulta de organizações.' },
    { id: 'contratos', titulo: 'Contratos', descricao: 'Criação e renovação de contratos.' },
  ],
  GESTOR_ALMOXARIFADO: [
    { id: 'lotes', titulo: 'Chegada de lotes', descricao: 'Registro e triagem de lotes recebidos.' },
    { id: 'equipamentos', titulo: 'Equipamentos', descricao: 'Triagem, estado físico e códigos internos.' },
  ],
  AUDITOR: [
    { id: 'organizacoes', titulo: 'Organizações', descricao: 'Consulta de organizações.' },
    { id: 'contratos', titulo: 'Contratos', descricao: 'Consulta de contratos por identificador.' },
    { id: 'lotes', titulo: 'Lotes', descricao: 'Consulta de lotes e equipamentos recebidos.' },
    { id: 'equipamentos', titulo: 'Equipamentos', descricao: 'Consulta de equipamentos por status.' },
    { id: 'rastreamento', titulo: 'Rastreabilidade', descricao: 'Consulta de histórico por equipamento.' },
    { id: 'relatorios', titulo: 'Relatórios', descricao: 'Consulta de relatórios operacionais e financeiros.' },
  ],
}

const nomesDosPapeis: Record<PapelUsuario, string> = {
  ADMINISTRADOR: 'Administrador',
  OPERADOR_CADASTRO: 'Operador de cadastro',
  GESTOR_ALMOXARIFADO: 'Gestor de almoxarifado',
  AUDITOR: 'Auditor',
}

export function isPapelUsuario(value: unknown): value is PapelUsuario {
  return typeof value === 'string' &&
    PAPEIS_USUARIO.some((papel) => papel === value)
}

export function obterNomePapel(papel: PapelUsuario): string {
  return nomesDosPapeis[papel]
}

export function obterOpcoesAcesso(papel: PapelUsuario): readonly OpcaoAcesso[] {
  return opcoesPorPapel[papel]
}
