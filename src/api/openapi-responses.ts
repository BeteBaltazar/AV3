import { EstadoFisico } from "../domain/enums/EstadoFisico.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { StatusLote } from "../domain/enums/StatusLote.js";
import { StatusRastreamento } from "../domain/enums/StatusRastreamento.js";
import { TipoEquipamento } from "../domain/enums/TipoEquipamento.js";

type JsonSchema = Record<string, unknown>;

interface DocumentedResponse {
  status: 200 | 201 | 202 | 204;
  schema?: JsonSchema;
}

const string = { type: "string" };
const dateTime = { type: "string", format: "date-time" };
const integer = { type: "integer" };
const number = { type: "number" };
const boolean = { type: "boolean" };

function object(properties: Record<string, unknown>): JsonSchema {
  return {
    type: "object",
    required: Object.keys(properties),
    additionalProperties: false,
    properties,
  };
}

function array(items: JsonSchema): JsonSchema {
  return { type: "array", items };
}

const organizationProperties = {
  id: string,
  razaoSocial: string,
  cnpj: string,
  cnpjNormalizado: string,
  inscricaoEstadual: string,
  enderecoCompleto: string,
  telefone: string,
  email: string,
  dataCadastro: dateTime,
  ativo: boolean,
  contratoVigente: boolean,
  version: integer,
};
const organizationSchema = object(organizationProperties);

const contractSchema = object({
  id: string,
  organizacaoId: string,
  dataAssinatura: dateTime,
  dataVencimento: dateTime,
  clausulas: string,
  valorMensal: number,
  renovacaoAutomatica: boolean,
  version: integer,
});

const movementSchema = object({
  id: string,
  equipamentoId: string,
  dataHora: dateTime,
  origem: string,
  destino: string,
  responsavel: string,
  observacao: string,
  version: integer,
});

const equipmentProperties = {
  id: string,
  codigoBarrasInterno: string,
  tipo: { type: "string", enum: Object.values(TipoEquipamento) },
  marca: string,
  modelo: string,
  anoFabricacao: integer,
  estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
  pesoQuilogramas: number,
  valorEstimadoRecuperacao: { anyOf: [number, { type: "null" }] },
  valorRecuperacaoReal: { anyOf: [number, { type: "null" }] },
  loteId: { anyOf: [string, { type: "null" }] },
  posicaoNoLote: integer,
  statusRastreamento: { type: "string", enum: Object.values(StatusRastreamento) },
  version: integer,
};
const equipmentSchema = object(equipmentProperties);

const lotProperties = {
  id: string,
  dataEntrada: dateTime,
  organizacaoId: string,
  notaFiscal: string,
  transportadora: string,
  statusProcessamento: { type: "string", enum: Object.values(StatusLote) },
  observacoes: string,
  version: integer,
  equipamentos: array(equipmentSchema),
};
const lotSchema = object(lotProperties);

const publicUserSchema = object({
  id: string,
  usuario: string,
  papel: { type: "string", enum: Object.values(PapelUsuario) },
  version: integer,
});

const parametersSchema = object({
  id: string,
  aliquotasImpostos: { type: "object", additionalProperties: number },
  coeficienteDepreciacao: number,
  version: integer,
});

const lotWithOrganizationSchema = object({
  id: string,
  dataEntrada: dateTime,
  organizacaoId: string,
  notaFiscal: string,
  transportadora: string,
  statusProcessamento: { type: "string", enum: Object.values(StatusLote) },
  observacoes: string,
  version: integer,
  organizacao: organizationSchema,
});

const trackedEquipmentSchema = object({
  ...equipmentProperties,
  lote: { anyOf: [lotWithOrganizationSchema, { type: "null" }] },
  historicoMovimentacao: array(movementSchema),
});

const trackingSchema = object({
  equipamento: trackedEquipmentSchema,
  lote: lotWithOrganizationSchema,
  organizacao: organizationSchema,
  movimentacoes: array(movementSchema),
});

const organizationReportSchema = object({
  organizacao: organizationSchema,
  lotes: array(lotSchema),
});

const partnerSchema = object({
  id: string,
  nome: string,
  organizacaoId: { anyOf: [string, { type: "null" }] },
  permissoes: { type: "array", items: string },
  ativo: boolean,
  limiteRequisicoes: integer,
  janelaLimiteSeg: integer,
  dataCadastro: dateTime,
});

const partnerCreationSchema = object({
  parceiro: partnerSchema,
  chaveApi: string,
  chaveId: string,
  aviso: string,
});

const analysisResultSchema = object({
  id: string,
  categoria: string,
  dataInicio: { anyOf: [dateTime, { type: "null" }] },
  dataFim: { anyOf: [dateTime, { type: "null" }] },
  metodo: string,
  dadosUtilizados: { type: "object", additionalProperties: true },
  resultado: { type: "object", additionalProperties: true },
  observacoes: string,
  realizadoEm: dateTime,
});

const successResponses: Record<string, DocumentedResponse> = {
  "GET /health": { status: 200, schema: object({ status: string }) },
  "POST /auth/login": {
    status: 200,
    schema: object({
      accessToken: string,
      tokenType: { type: "string", enum: ["Bearer"] },
      expiresIn: string,
    }),
  },
  "GET /usuarios": { status: 200, schema: array(publicUserSchema) },
  "GET /usuarios/:id": { status: 200, schema: publicUserSchema },
  "POST /usuarios": { status: 201, schema: publicUserSchema },
  "PATCH /usuarios/:id": { status: 200, schema: publicUserSchema },
  "DELETE /usuarios/:id": { status: 204 },
  "GET /organizacoes": { status: 200, schema: array(organizationSchema) },
  "GET /organizacoes/:id": { status: 200, schema: organizationSchema },
  "POST /organizacoes": { status: 201, schema: organizationSchema },
  "POST /organizacoes/:id/desativacao": { status: 200, schema: organizationSchema },
  "DELETE /organizacoes/:id": { status: 204 },
  "POST /organizacoes/:organizacaoId/contratos": { status: 201, schema: contractSchema },
  "GET /organizacoes/:organizacaoId/contratos": { status: 200, schema: array(contractSchema) },
  "PATCH /contratos/:id": { status: 200, schema: contractSchema },
  "GET /contratos/:id": { status: 200, schema: contractSchema },
  "DELETE /contratos/:id": { status: 204 },
  "GET /lotes": { status: 200, schema: array(lotSchema) },
  "GET /lotes/:id": { status: 200, schema: lotSchema },
  "PATCH /lotes/:id": { status: 200, schema: lotSchema },
  "POST /lotes": { status: 201, schema: lotSchema },
  "POST /lotes/:id/equipamentos": { status: 201, schema: lotSchema },
  "POST /lotes/:id/triagem": { status: 200, schema: lotSchema },
  "DELETE /lotes/:id": { status: 204 },
  "GET /equipamentos": { status: 200, schema: array(equipmentSchema) },
  "POST /equipamentos": { status: 201, schema: equipmentSchema },
  "GET /equipamentos/:id": { status: 200, schema: equipmentSchema },
  "GET /equipamentos/:id/rastreamento": { status: 200, schema: trackingSchema },
  "PATCH /equipamentos/:id/estado-fisico": { status: 200, schema: equipmentSchema },
  "POST /equipamentos/:id/desmonte": { status: 200, schema: equipmentSchema },
  "POST /equipamentos/:id/desvinculacao": { status: 200, schema: equipmentSchema },
  "DELETE /equipamentos/:id": { status: 204 },
  "GET /equipamentos/:id/depreciacao": {
    status: 200,
    schema: object({ id: string, valor: number }),
  },
  "GET /equipamentos/:id/movimentacoes": { status: 200, schema: array(movementSchema) },
  "GET /codigos-barras": { status: 200, schema: object({ codigo: string }) },
  "GET /relatorios/financeiro": { status: 200, schema: array(contractSchema) },
  "GET /relatorios/status/:status": { status: 200, schema: array(equipmentSchema) },
  "POST /analises/:categoria/executar": { status: 200, schema: analysisResultSchema },
  "GET /analises/resultados": { status: 200, schema: array(analysisResultSchema) },
  "PATCH /parametros-globais": { status: 200, schema: parametersSchema },
  "GET /parametros-globais": { status: 200, schema: parametersSchema },
  "GET /relatorios/organizacoes/:id": { status: 200, schema: organizationReportSchema },
  "POST /api/v1/admin/parceiros": { status: 201, schema: partnerCreationSchema },
  "POST /api/v1/admin/chaves/:id/revogacao": { status: 200, schema: object({ revogada: boolean }) },
  "GET /api/v1/public/equipamentos/:id/rastreamento": { status: 200, schema: trackingSchema },
  "POST /api/v1/public/lotes": { status: 201, schema: lotSchema },
  "GET /api/v1/public/analises/resultados": { status: 200, schema: array(analysisResultSchema) },
  "POST /api/v1/public/analises/:categoria/executar": { status: 200, schema: analysisResultSchema },
  "POST /api/v1/public/tarefas": {
    status: 202,
    schema: object({
      taskId: string,
      status: { type: "string", enum: ["AGUARDANDO_PROCESSAMENTO"] },
      statusUrl: string,
    }),
  },
  "GET /api/v1/public/tarefas/:id": {
    status: 200,
    schema: object({
      taskId: string,
      status: { type: "string", enum: ["AGUARDANDO_PROCESSAMENTO", "EM_PROCESSAMENTO", "CONCLUIDA", "FALHOU"] },
      categoria: string,
      formato: { type: "string", enum: ["JSON", "CSV"] },
      tentativas: integer,
      tentativasMax: integer,
      ultimaFalha: { anyOf: [string, { type: "null" }] },
      criadoEm: dateTime,
      iniciadoEm: { anyOf: [dateTime, { type: "null" }] },
      concluidoEm: { anyOf: [dateTime, { type: "null" }] },
      downloadUrl: { anyOf: [string, { type: "null" }] },
    }),
  },
  "GET /api/v1/public/tarefas/:id/download": {
    status: 200,
    schema: { type: "string", contentEncoding: "binary" },
  },
};

export function getDocumentedResponse(
  method: string,
  url: string,
): DocumentedResponse {
  const response = successResponses[`${method.toUpperCase()} ${url}`];
  if (!response) {
    throw new Error(`Resposta OpenAPI nao definida para ${method} ${url}.`);
  }
  return response;
}
