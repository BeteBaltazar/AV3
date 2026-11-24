import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import type { Actor, GreencodeApiService } from "./services/GreencodeApiService.js";
import { EstadoFisico } from "../domain/enums/EstadoFisico.js";
import { TipoEquipamento } from "../domain/enums/TipoEquipamento.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ReportQueuePublisher, ReportTaskData } from "../queue/reportQueue.js";

interface ApiKeyHeaders {
  "x-api-key": string;
}

interface PartnerCreateBody {
  nome: string;
  organizacaoId?: string;
  permissoes: string[];
  limiteRequisicoes?: number;
  janelaLimiteSeg?: number;
}

interface PartnerKeyParams {
  id: string;
}

interface PublicLotBody {
  dataEntrada: string;
  notaFiscal: string;
  transportadora: string;
  observacoes?: string;
  equipamentos?: Array<{
    id?: string;
    codigoBarrasInterno: string;
    tipo: TipoEquipamento;
    marca: string;
    modelo: string;
    anoFabricacao: number;
    estadoFisico?: EstadoFisico;
    pesoQuilogramas: number;
    valorEstimadoRecuperacao?: number;
    valorRecuperacaoReal?: number;
  }>;
}

const publicPermission = {
  rastreabilidade: "RASTREABILIDADE_LEITURA",
  loteConsultar: "LOTE_CONSULTAR",
  loteCadastrar: "LOTE_CADASTRAR",
  analiseConsultar: "ANALISE_CONSULTAR",
  analiseExecutar: "ANALISE_EXECUTAR",
} as const;

export function registerPublicApiRoutes(
  app: FastifyInstance,
  service: GreencodeApiService,
  reportQueue?: ReportQueuePublisher,
): void {
  app.post<{ Body: PartnerCreateBody }>("/api/v1/admin/parceiros", {
    preHandler: app.autenticar,
    config: { rateLimit: false },
    schema: {
      summary: "Cria parceiro externo e gera uma chave API",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["nome", "permissoes"],
        additionalProperties: false,
        properties: {
          nome: { type: "string", minLength: 1, maxLength: 255 },
          organizacaoId: { type: "string", minLength: 1, maxLength: 128 },
          permissoes: { type: "array", items: { type: "string" } },
          limiteRequisicoes: { type: "integer", minimum: 1, default: 100 },
          janelaLimiteSeg: { type: "integer", minimum: 1, default: 60 },
        },
      },
    },
  }, async (request, reply) => reply.code(201).send(
    await service.createPartner(actor(request), {
      nome: request.body.nome,
      ...(request.body.organizacaoId ? { organizacaoId: request.body.organizacaoId } : {}),
      permissoes: request.body.permissoes,
      limiteRequisicoes: request.body.limiteRequisicoes ?? 100,
      janelaLimiteSeg: request.body.janelaLimiteSeg ?? 60,
    }),
  ));

  app.post<{ Params: PartnerKeyParams }>("/api/v1/admin/chaves/:id/revogacao", {
    preHandler: app.autenticar,
    config: { rateLimit: false },
    schema: {
      summary: "Revoga uma chave API de parceiro",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1 } },
      },
    },
  }, async (request) => {
    await service.revokePartnerKey(actor(request), request.params.id);
    return { revogada: true };
  });

  app.get<{ Params: { id: string }; Headers: ApiKeyHeaders }>("/api/v1/public/equipamentos/:id/rastreamento", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Consulta rastreabilidade publicada ao parceiro",
      security: [{ apiKey: [] }],
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1 } },
      },
    },
  }, async (request) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    service.exigirPermissaoParceiro(partner, publicPermission.rastreabilidade);
    const tracked = await service.trackEquipment(
      publicActor(partner, "AUDITOR"),
      request.params.id,
    );
    const lot = tracked.lote as { organizacaoId?: string } | null;
    if (partner.organizacaoId && lot?.organizacaoId !== partner.organizacaoId) {
      throw new ApiError(404, "Equipamento nao encontrado para este parceiro.", "NOT_FOUND");
    }
    return tracked;
  });

  app.post<{ Body: PublicLotBody; Headers: ApiKeyHeaders }>("/api/v1/public/lotes", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Cadastra lote autorizado para o parceiro",
      security: [{ apiKey: [] }],
      body: {
        type: "object",
        required: ["dataEntrada", "notaFiscal", "transportadora"],
        additionalProperties: false,
        properties: {
          dataEntrada: { type: "string", format: "date-time" },
          notaFiscal: { type: "string", minLength: 1, maxLength: 100 },
          transportadora: { type: "string", minLength: 1, maxLength: 255 },
          observacoes: { type: "string", maxLength: 5000 },
          equipamentos: { type: "array", items: { type: "object" } },
        },
      },
    },
  }, async (request, reply) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    service.exigirPermissaoParceiro(partner, publicPermission.loteCadastrar);
    if (!partner.organizacaoId) {
      throw new ApiError(403, "Parceiro nao esta associado a uma organizacao.", "FORBIDDEN");
    }
    const lot = await service.createLot(
      publicActor(partner, "GESTOR_ALMOXARIFADO"),
      {
        dataEntrada: new Date(request.body.dataEntrada),
        organizacaoId: partner.organizacaoId,
        notaFiscal: request.body.notaFiscal,
        transportadora: request.body.transportadora,
        ...(request.body.observacoes ? { observacoes: request.body.observacoes } : {}),
        ...(request.body.equipamentos ? { equipamentos: request.body.equipamentos } : {}),
      },
    );
    return reply.code(201).send(lot);
  });

  app.get<{ Querystring: { categoria?: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL"; dataInicio?: string; dataFim?: string }; Headers: ApiKeyHeaders }>("/api/v1/public/analises/resultados", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Consulta resultados analiticos publicados",
      security: [{ apiKey: [] }],
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: {
          categoria: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "VIDA_UTIL"] },
          dataInicio: { type: "string", format: "date-time" },
          dataFim: { type: "string", format: "date-time" },
        },
      },
    },
  }, async (request) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    service.exigirPermissaoParceiro(partner, publicPermission.analiseConsultar);
    if (!partner.organizacaoId) {
      throw new ApiError(403, "Parceiro nao esta associado a uma organizacao.", "FORBIDDEN");
    }
    return service.listAnalysisResults(
      publicActor(partner, "AUDITOR"),
      request.query.categoria,
      { parceiroId: partner.id, organizacaoId: partner.organizacaoId },
    );
  });

  app.post<{ Params: { categoria: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL" }; Querystring: { dataInicio?: string; dataFim?: string }; Headers: ApiKeyHeaders }>("/api/v1/public/analises/:categoria/executar", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Executa uma analise autorizada para o parceiro",
      security: [{ apiKey: [] }],
      params: {
        type: "object",
        required: ["categoria"],
        additionalProperties: false,
        properties: {
          categoria: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "VIDA_UTIL"] },
        },
      },
    },
  }, async (request) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    service.exigirPermissaoParceiro(partner, publicPermission.analiseExecutar);
    if (!partner.organizacaoId) {
      throw new ApiError(403, "Parceiro nao esta associado a uma organizacao.", "FORBIDDEN");
    }
    return service.runAnalysis(
      publicActor(partner, "AUDITOR"),
      request.params.categoria,
      request.query.dataInicio ? new Date(request.query.dataInicio) : undefined,
      request.query.dataFim ? new Date(request.query.dataFim) : undefined,
      { parceiroId: partner.id, organizacaoId: partner.organizacaoId },
    );
  });

  app.post<{
    Body: { categoria: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL"; formato: "JSON" | "CSV"; dataInicio?: string; dataFim?: string };
    Headers: ApiKeyHeaders;
  }>("/api/v1/public/tarefas", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Solicita um relatorio assíncrono",
      security: [{ apiKey: [] }],
      body: {
        type: "object",
        required: ["categoria", "formato"],
        additionalProperties: false,
        properties: {
          categoria: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "VIDA_UTIL"] },
          formato: { type: "string", enum: ["JSON", "CSV"] },
          dataInicio: { type: "string", format: "date-time" },
          dataFim: { type: "string", format: "date-time" },
        },
      },
    },
  }, async (request, reply) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    service.exigirPermissaoParceiro(partner, publicPermission.analiseExecutar);
    if (!partner.organizacaoId) {
      throw new ApiError(403, "Parceiro nao esta associado a uma organizacao.", "FORBIDDEN");
    }
    if (!reportQueue) {
      throw new ApiError(503, "Fila assincrona indisponivel.", "ASYNC_QUEUE_UNAVAILABLE");
    }
    const dataInicio = request.body.dataInicio ? new Date(request.body.dataInicio) : undefined;
    const dataFim = request.body.dataFim ? new Date(request.body.dataFim) : undefined;
    const task = await service.createReportTask(
      partner,
      request.body.categoria,
      request.body.formato,
      dataInicio,
      dataFim,
    );
    try {
      await reportQueue.enqueue({
        taskId: task.id,
        categoria: request.body.categoria,
        formato: request.body.formato,
        ...(dataInicio ? { dataInicio: dataInicio.toISOString() } : {}),
        ...(dataFim ? { dataFim: dataFim.toISOString() } : {}),
      } satisfies ReportTaskData, task.tentativasMax);
    } catch (error) {
      request.log.error({ err: error, taskId: task.id }, "Falha ao enfileirar relatorio.");
      await service.failReportTask(
        task.id,
        error instanceof Error ? error.message : String(error),
      );
      throw new ApiError(503, "Fila assíncrona indisponível.", "ASYNC_QUEUE_UNAVAILABLE");
    }
    return reply.code(202).send({
      taskId: task.id,
      status: "AGUARDANDO_PROCESSAMENTO",
      statusUrl: `/api/v1/public/tarefas/${task.id}`,
    });
  });

  app.get<{ Params: { id: string }; Headers: ApiKeyHeaders }>("/api/v1/public/tarefas/:id", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Consulta status de uma tarefa assíncrona",
      security: [{ apiKey: [] }],
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1 } },
      },
    },
  }, async (request) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    const task = await service.getReportTask(partner.id, request.params.id);
    return {
      taskId: task.id,
      status: task.status,
      categoria: task.categoria,
      formato: task.formato,
      tentativas: task.tentativas,
      tentativasMax: task.tentativasMax,
      ultimaFalha: task.ultimaFalha,
      criadoEm: task.criadoEm,
      iniciadoEm: task.iniciadoEm,
      concluidoEm: task.concluidoEm,
      downloadUrl: task.status === "CONCLUIDA"
        ? `/api/v1/public/tarefas/${task.id}/download`
        : null,
    };
  });

  app.get<{ Params: { id: string }; Headers: ApiKeyHeaders }>("/api/v1/public/tarefas/:id/download", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      summary: "Baixa o relatório concluído de uma tarefa",
      security: [{ apiKey: [] }],
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const partner = await service.authenticatePartner(exigirApiKey(request));
    const task = await service.getReportTask(partner.id, request.params.id);
    if (task.status === "FALHOU") {
      throw new ApiError(409, "A tarefa falhou e nenhum relatório está disponível.", "REPORT_FAILED");
    }
    if (task.status !== "CONCLUIDA") {
      throw new ApiError(409, "O relatório ainda não está disponível.", "REPORT_NOT_READY");
    }
    if (!task.arquivoUrl) {
      throw new ApiError(404, "Arquivo do relatório não encontrado.", "NOT_FOUND");
    }
    const extension = task.formato === "CSV" ? "csv" : "json";
    const filePath = join(process.env.REPORT_OUTPUT_DIR ?? join(process.cwd(), "reports"), `${task.id}.${extension}`);
    if (!existsSync(filePath)) {
      throw new ApiError(404, "Arquivo do relatório não encontrado.", "NOT_FOUND");
    }
    const content = await readFile(filePath);
    return reply
      .header("content-disposition", `attachment; filename="${task.id}.${extension}"`)
      .header("content-type", task.formato === "CSV" ? "text/csv; charset=utf-8" : "application/json")
      .send(content);
  });
}

function exigirApiKey(request: FastifyRequest): string {
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey !== "string" || !apiKey) {
    throw new ApiError(401, "Cabeçalho x-api-key obrigatorio.", "INVALID_API_KEY");
  }
  return apiKey;
}

function actor(request: FastifyRequest): Actor {
  if (!request.identidade) {
    throw new ApiError(401, "Token invalido ou expirado.", "UNAUTHENTICATED");
  }
  return request.identidade;
}

function publicActor(_partner: { id: string }, papel: "AUDITOR" | "GESTOR_ALMOXARIFADO"): Actor {
  return {
    id: "public-api",
    usuario: "api-publica",
    papel: papel === "AUDITOR"
      ? PapelUsuario.AUDITOR
      : PapelUsuario.GESTOR_ALMOXARIFADO,
  };
}
