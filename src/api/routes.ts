import type { FastifyInstance, FastifyRequest } from "fastify";
import { EstadoFisico } from "../domain/enums/EstadoFisico.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { StatusRastreamento } from "../domain/enums/StatusRastreamento.js";
import { TipoEquipamento } from "../domain/enums/TipoEquipamento.js";
import type { Actor, GreencodeApiService } from "./services/GreencodeApiService.js";
import { ApiError } from "./errors.js";

interface IdParams {
  id: string;
}

interface OrganizationParams {
  organizacaoId: string;
}

interface LoginBody {
  usuario: string;
  senha: string;
}

interface VersionBody {
  version: number;
}

interface CreateUserBody {
  usuario: string;
  senha: string;
  papel: PapelUsuario;
}

interface UpdateUserBody extends VersionBody {
  senha?: string;
  papel?: PapelUsuario;
}

interface OrganizationBody {
  id?: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
}

interface ContractBody {
  id?: string;
  dataAssinatura: string;
  dataVencimento: string;
  clausulas: string;
  valorMensal: number;
  renovacaoAutomatica: boolean;
}

interface UpdateContractBody extends VersionBody {
  dataAssinatura?: string;
  dataVencimento?: string;
  clausulas?: string;
  valorMensal?: number;
  renovacaoAutomatica?: boolean;
}

interface UpdateLotBody extends VersionBody {
  notaFiscal?: string;
  transportadora?: string;
  observacoes?: string;
}

interface CreateLotBody {
  id?: string;
  dataEntrada: string;
  organizacaoId: string;
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
  }>;
}

interface AddEquipmentBody extends VersionBody {
  equipamentos: NonNullable<CreateLotBody["equipamentos"]>;
}

type EquipmentBody = NonNullable<CreateLotBody["equipamentos"]>[number];

interface PhysicalStateBody extends VersionBody {
  estadoFisico: EstadoFisico;
  justificativa?: string;
}

interface PeriodQuery {
  dataInicio?: string;
  dataFim?: string;
}

interface ParameterBody extends VersionBody {
  aliquotasImpostos?: Record<string, number>;
  coeficienteDepreciacao?: number;
}

const protectedRoute = (app: FastifyInstance) => ({
  preHandler: app.autenticar,
});

const idParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
};

const versionBodySchema = {
  type: "object",
  required: ["version"],
  additionalProperties: false,
  properties: { version: { type: "integer", minimum: 1 } },
};

const dateTimeSchema = { type: "string", format: "date-time" };

export function registerApiRoutes(
  app: FastifyInstance,
  service: GreencodeApiService,
  jwtExpiresIn: string,
): void {
  app.post<{ Body: LoginBody }>("/auth/login", {
    schema: {
      summary: "Autentica usuario e retorna JWT",
      body: {
        type: "object",
        required: ["usuario", "senha"],
        additionalProperties: false,
        properties: {
          usuario: { type: "string", minLength: 1, maxLength: 100 },
          senha: { type: "string", minLength: 1, maxLength: 1024 },
        },
      },
    },
  }, async (request) => {
    const user = await service.login(request.body.usuario, request.body.senha);
    const accessToken = app.jwt.sign(
      { sub: user.id, role: user.papel },
      { expiresIn: jwtExpiresIn },
    );
    return { accessToken, tokenType: "Bearer", expiresIn: jwtExpiresIn };
  });

  app.get("/usuarios", {
    ...protectedRoute(app),
    schema: { summary: "Lista usuarios sem retornar hashes de senha", security: [{ bearerAuth: [] }] },
  }, async (request) => service.listUsers(actor(request)));

  app.get<{ Params: IdParams }>("/usuarios/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Consulta usuario sem retornar hashes de senha",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request) => usuarioPublico(
    await service.getUser(actor(request), request.params.id),
  ));

  app.post<{ Body: CreateUserBody }>("/usuarios", {
    ...protectedRoute(app),
    schema: {
      summary: "Cria usuario",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["usuario", "senha", "papel"],
        additionalProperties: false,
        properties: {
          usuario: { type: "string", minLength: 1, maxLength: 100 },
          senha: { type: "string", minLength: 1, maxLength: 1024 },
          papel: { type: "string", enum: Object.values(PapelUsuario) },
        },
      },
    },
  }, async (request, reply) => {
    const created = await service.createUser(actor(request), request.body);
    return reply.code(201).send(usuarioPublico(created));
  });

  app.patch<{ Params: IdParams; Body: UpdateUserBody }>("/usuarios/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Atualiza senha ou papel de usuario",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: {
        type: "object",
        required: ["version"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          senha: { type: "string", minLength: 1, maxLength: 1024 },
          papel: { type: "string", enum: Object.values(PapelUsuario) },
        },
      },
    },
  }, async (request) => usuarioPublico(
    await service.updateUser(actor(request), request.params.id, request.body),
  ));

  app.delete<{ Params: IdParams; Body: VersionBody }>("/usuarios/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Exclui usuario",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request, reply) => {
    await service.deleteUser(actor(request), request.params.id, request.body.version);
    return reply.code(204).send();
  });

  app.get<{ Querystring: { activeOnly?: boolean } }>("/organizacoes", {
    ...protectedRoute(app),
    schema: {
      summary: "Lista organizacoes ativas",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: { activeOnly: { type: "boolean", default: true } },
      },
    },
  }, async (request) => service.listOrganizations(actor(request), request.query.activeOnly ?? true));

  app.get<{ Params: IdParams }>("/organizacoes/:id", {
    ...protectedRoute(app),
    schema: { summary: "Consulta organizacao", security: [{ bearerAuth: [] }], params: idParamsSchema },
  }, async (request) => service.getOrganization(actor(request), request.params.id));

  app.post<{ Body: OrganizationBody }>("/organizacoes", {
    ...protectedRoute(app),
    schema: {
      summary: "Cadastra organizacao",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["razaoSocial", "cnpj", "inscricaoEstadual", "enderecoCompleto", "telefone", "email"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 128 },
          razaoSocial: { type: "string", minLength: 1, maxLength: 255 },
          cnpj: { type: "string", minLength: 14, maxLength: 18 },
          inscricaoEstadual: { type: "string", minLength: 1, maxLength: 100 },
          enderecoCompleto: { type: "string", minLength: 1, maxLength: 500 },
          telefone: { type: "string", minLength: 1, maxLength: 50 },
          email: { type: "string", format: "email", maxLength: 254 },
        },
      },
    },
  }, async (request, reply) => reply.code(201).send(
    await service.createOrganization(actor(request), request.body),
  ));

  app.post<{ Params: IdParams; Body: VersionBody }>("/organizacoes/:id/desativacao", {
    ...protectedRoute(app),
    schema: {
      summary: "Desativa organizacao",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request) => service.deactivateOrganization(
    actor(request),
    request.params.id,
    request.body.version,
  ));

  app.delete<{ Params: IdParams; Body: VersionBody }>("/organizacoes/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Apaga organizacao desativada sem lotes vinculados",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request, reply) => {
    await service.deleteOrganization(actor(request), request.params.id, request.body.version);
    return reply.code(204).send();
  });

  app.post<{ Params: OrganizationParams; Body: ContractBody }>("/organizacoes/:organizacaoId/contratos", {
    ...protectedRoute(app),
    schema: {
      summary: "Cria contrato para organizacao",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["organizacaoId"],
        additionalProperties: false,
        properties: { organizacaoId: { type: "string", minLength: 1 } },
      },
      body: {
        type: "object",
        required: ["dataAssinatura", "dataVencimento", "clausulas", "valorMensal", "renovacaoAutomatica"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 128 },
          dataAssinatura: dateTimeSchema,
          dataVencimento: dateTimeSchema,
          clausulas: { type: "string", minLength: 1, maxLength: 10000 },
          valorMensal: { type: "number", minimum: 0 },
          renovacaoAutomatica: { type: "boolean" },
        },
      },
    },
  }, async (request, reply) => reply.code(201).send(
    await service.createContract(actor(request), request.params.organizacaoId, {
      ...request.body,
      dataAssinatura: new Date(request.body.dataAssinatura),
      dataVencimento: new Date(request.body.dataVencimento),
    }),
  ));

  app.get<{ Params: OrganizationParams }>("/organizacoes/:organizacaoId/contratos", {
    ...protectedRoute(app),
    schema: {
      summary: "Lista contratos de uma organizacao",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["organizacaoId"],
        additionalProperties: false,
        properties: { organizacaoId: { type: "string", minLength: 1 } },
      },
    },
  }, async (request) => service.listContractsByOrganization(
    actor(request),
    request.params.organizacaoId,
  ));

  app.patch<{ Params: IdParams; Body: UpdateContractBody }>("/contratos/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Atualiza dados do contrato",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: {
        type: "object",
        required: ["version"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          dataAssinatura: dateTimeSchema,
          dataVencimento: dateTimeSchema,
          clausulas: { type: "string", minLength: 1, maxLength: 10000 },
          valorMensal: { type: "number", minimum: 0 },
          renovacaoAutomatica: { type: "boolean" },
        },
      },
    },
  }, async (request) => service.updateContract(actor(request), request.params.id, {
    version: request.body.version,
    ...(request.body.dataAssinatura === undefined
      ? {}
      : { dataAssinatura: new Date(request.body.dataAssinatura) }),
    ...(request.body.dataVencimento === undefined
      ? {}
      : { dataVencimento: new Date(request.body.dataVencimento) }),
    ...(request.body.clausulas === undefined ? {} : { clausulas: request.body.clausulas }),
    ...(request.body.valorMensal === undefined ? {} : { valorMensal: request.body.valorMensal }),
    ...(request.body.renovacaoAutomatica === undefined
      ? {}
      : { renovacaoAutomatica: request.body.renovacaoAutomatica }),
  }));

  app.get<{ Params: IdParams }>("/contratos/:id", {
    ...protectedRoute(app),
    schema: { summary: "Consulta contrato", security: [{ bearerAuth: [] }], params: idParamsSchema },
  }, async (request) => service.getContract(actor(request), request.params.id));

  app.delete<{ Params: IdParams; Body: VersionBody }>("/contratos/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Exclui contrato",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request, reply) => {
    await service.deleteContract(actor(request), request.params.id, request.body.version);
    return reply.code(204).send();
  });

  app.get<{ Querystring: PeriodQuery }>("/lotes", {
    ...protectedRoute(app),
    schema: {
      summary: "Lista lotes, opcionalmente filtrados por periodo",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: { dataInicio: dateTimeSchema, dataFim: dateTimeSchema },
      },
    },
  }, async (request) => service.listLots(
    actor(request),
    request.query.dataInicio ? new Date(request.query.dataInicio) : undefined,
    request.query.dataFim ? new Date(request.query.dataFim) : undefined,
  ));

  app.get<{ Params: IdParams }>("/lotes/:id", {
    ...protectedRoute(app),
    schema: { summary: "Consulta lote e equipamentos associados", security: [{ bearerAuth: [] }], params: idParamsSchema },
  }, async (request) => service.getLot(actor(request), request.params.id));

  app.patch<{ Params: IdParams; Body: UpdateLotBody }>("/lotes/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Atualiza dados do lote",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: {
        type: "object",
        required: ["version"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          notaFiscal: { type: "string", minLength: 1, maxLength: 100 },
          transportadora: { type: "string", minLength: 1, maxLength: 255 },
          observacoes: { type: "string", maxLength: 5000 },
        },
      },
    },
  }, async (request) => service.updateLot(actor(request), request.params.id, request.body));

  app.post<{ Body: CreateLotBody }>("/lotes", {
    ...protectedRoute(app),
    schema: {
      summary: "Cria lote e equipamentos associados em uma transacao",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["dataEntrada", "organizacaoId", "notaFiscal", "transportadora"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 128 },
          dataEntrada: dateTimeSchema,
          organizacaoId: { type: "string", minLength: 1 },
          notaFiscal: { type: "string", minLength: 1, maxLength: 100 },
          transportadora: { type: "string", minLength: 1, maxLength: 255 },
          observacoes: { type: "string", maxLength: 5000 },
          equipamentos: {
            type: "array",
            items: {
              type: "object",
              required: ["codigoBarrasInterno", "tipo", "marca", "modelo", "anoFabricacao", "pesoQuilogramas"],
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 1, maxLength: 128 },
                codigoBarrasInterno: { type: "string", minLength: 1, maxLength: 100 },
                tipo: { type: "string", enum: Object.values(TipoEquipamento) },
                marca: { type: "string", minLength: 1, maxLength: 255 },
                modelo: { type: "string", minLength: 1, maxLength: 255 },
                anoFabricacao: { type: "integer", minimum: 1 },
                estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
                pesoQuilogramas: { type: "number", minimum: 0 },
                valorEstimadoRecuperacao: { type: "number", minimum: 0 },
                valorRecuperacaoReal: { type: "number", minimum: 0 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => reply.code(201).send(
    await service.createLot(actor(request), {
      ...request.body,
      dataEntrada: new Date(request.body.dataEntrada),
    }),
  ));

  app.post<{ Params: IdParams; Body: AddEquipmentBody }>("/lotes/:id/equipamentos", {
    ...protectedRoute(app),
    schema: {
      summary: "Adiciona equipamentos a lote existente em uma transacao",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: {
        type: "object",
        required: ["version", "equipamentos"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          equipamentos: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["codigoBarrasInterno", "tipo", "marca", "modelo", "anoFabricacao", "pesoQuilogramas"],
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 1, maxLength: 128 },
                codigoBarrasInterno: { type: "string", minLength: 1, maxLength: 100 },
                tipo: { type: "string", enum: Object.values(TipoEquipamento) },
                marca: { type: "string", minLength: 1, maxLength: 255 },
                modelo: { type: "string", minLength: 1, maxLength: 255 },
                anoFabricacao: { type: "integer", minimum: 1 },
                estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
                pesoQuilogramas: { type: "number", minimum: 0 },
                valorEstimadoRecuperacao: { type: "number", minimum: 0 },
                valorRecuperacaoReal: { type: "number", minimum: 0 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => reply.code(201).send(
    await service.addEquipmentToLot(actor(request), request.params.id, request.body),
  ));

  app.post<{ Params: IdParams; Body: VersionBody }>("/lotes/:id/triagem", {
    ...protectedRoute(app),
    schema: {
      summary: "Processa triagem do lote e registra movimentacoes atomicamente",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request) => service.triageLot(
    actor(request),
    request.params.id,
    request.body.version,
    actor(request).usuario,
  ));

  app.delete<{ Params: IdParams; Body: VersionBody }>("/lotes/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Exclui lote vazio",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request, reply) => {
    await service.deleteLot(actor(request), request.params.id, request.body.version);
    return reply.code(204).send();
  });

  app.get<{ Querystring: { status?: StatusRastreamento } }>("/equipamentos", {
    ...protectedRoute(app),
    schema: {
      summary: "Lista equipamentos, opcionalmente filtrados por status",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: { status: { type: "string", enum: Object.values(StatusRastreamento) } },
      },
    },
  }, async (request) => service.listEquipment(actor(request), request.query.status));

  app.post<{ Body: EquipmentBody }>("/equipamentos", {
    ...protectedRoute(app),
    schema: {
      summary: "Cadastra equipamento avulso, sem lote",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["codigoBarrasInterno", "tipo", "marca", "modelo", "anoFabricacao", "pesoQuilogramas"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 128 },
          codigoBarrasInterno: { type: "string", minLength: 1, maxLength: 100 },
          tipo: { type: "string", enum: Object.values(TipoEquipamento) },
          marca: { type: "string", minLength: 1, maxLength: 255 },
          modelo: { type: "string", minLength: 1, maxLength: 255 },
          anoFabricacao: { type: "integer", minimum: 1 },
          estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
          pesoQuilogramas: { type: "number", minimum: 0 },
          valorEstimadoRecuperacao: { type: "number", minimum: 0 },
          valorRecuperacaoReal: { type: "number", minimum: 0 },
        },
      },
    },
  }, async (request, reply) => reply.code(201).send(
    await service.createEquipment(actor(request), request.body),
  ));

  app.get<{ Params: IdParams }>("/equipamentos/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Consulta equipamento sem carregar historico de rastreamento",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request) => service.getEquipment(actor(request), request.params.id));

  app.get<{ Params: IdParams }>("/equipamentos/:id/rastreamento", {
    ...protectedRoute(app),
    schema: { summary: "Consulta equipamento, lote, organizacao e historico", security: [{ bearerAuth: [] }], params: idParamsSchema },
  }, async (request) => service.trackEquipment(actor(request), request.params.id));

  app.patch<{ Params: IdParams; Body: PhysicalStateBody }>("/equipamentos/:id/estado-fisico", {
    ...protectedRoute(app),
    schema: {
      summary: "Atualiza estado fisico de equipamento",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: {
        type: "object",
        required: ["version", "estadoFisico"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
          justificativa: { type: "string", maxLength: 2000 },
        },
      },
    },
  }, async (request) => service.updatePhysicalState(actor(request), request.params.id, request.body));

  app.post<{ Params: IdParams; Body: VersionBody }>("/equipamentos/:id/desmonte", {
    ...protectedRoute(app),
    schema: {
      summary: "Move equipamento para desmonte e grava movimentacao",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request) => service.moveToDismantle(
    actor(request),
    request.params.id,
    request.body.version,
    actor(request).usuario,
  ));

  app.post<{ Params: IdParams; Body: VersionBody }>("/equipamentos/:id/desvinculacao", {
    ...protectedRoute(app),
    schema: {
      summary: "Desvincula equipamento do lote e reordena as posicoes",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request) => service.unlinkEquipment(actor(request), request.params.id, request.body.version));

  app.delete<{ Params: IdParams; Body: VersionBody }>("/equipamentos/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Exclui equipamento sem lote e sem historico",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: versionBodySchema,
    },
  }, async (request, reply) => {
    await service.deleteEquipment(actor(request), request.params.id, request.body.version);
    return reply.code(204).send();
  });

  app.get<{ Params: IdParams }>("/equipamentos/:id/depreciacao", {
    ...protectedRoute(app),
    schema: { summary: "Calcula depreciacao com coeficiente global", security: [{ bearerAuth: [] }], params: idParamsSchema },
  }, async (request) => service.calculateDepreciation(actor(request), request.params.id));

  app.get<{ Params: IdParams }>("/equipamentos/:id/movimentacoes", {
    ...protectedRoute(app),
    schema: { summary: "Lista historico de movimentacoes", security: [{ bearerAuth: [] }], params: idParamsSchema },
  }, async (request) => (await service.trackEquipment(actor(request), request.params.id)).movimentacoes);

  app.get<{ Querystring: { tipo: TipoEquipamento; sequencia: number } }>("/codigos-barras", {
    ...protectedRoute(app),
    schema: {
      summary: "Gera codigo interno sem persistir equipamento",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        required: ["tipo", "sequencia"],
        additionalProperties: false,
        properties: {
          tipo: { type: "string", enum: Object.values(TipoEquipamento) },
          sequencia: { type: "integer", minimum: 0 },
        },
      },
    },
  }, async (request) => {
    return {
      codigo: service.generateBarcode(
        actor(request),
        request.query.tipo,
        request.query.sequencia,
      ),
    };
  });

  app.get<{ Querystring: { inicio: string; fim: string } }>("/relatorios/financeiro", {
    ...protectedRoute(app),
    schema: {
      summary: "Lista contratos assinados no periodo",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        required: ["inicio", "fim"],
        additionalProperties: false,
        properties: { inicio: dateTimeSchema, fim: dateTimeSchema },
      },
    },
  }, async (request) => service.financialReport(
    actor(request),
    new Date(request.query.inicio),
    new Date(request.query.fim),
  ));

  app.get<{ Params: { status: StatusRastreamento } }>("/relatorios/status/:status", {
    ...protectedRoute(app),
    schema: {
      summary: "Gera relatorio de equipamentos por status",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["status"],
        additionalProperties: false,
        properties: { status: { type: "string", enum: Object.values(StatusRastreamento) } },
      },
    },
  }, async (request) => service.reportByStatus(actor(request), request.params.status));

  app.post<{
    Params: { categoria: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL" };
    Querystring: PeriodQuery;
  }>("/analises/:categoria/executar", {
    ...protectedRoute(app),
    schema: {
      summary: "Executa e persiste uma analise estatistica",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["categoria"],
        additionalProperties: false,
        properties: {
          categoria: {
            type: "string",
            enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "VIDA_UTIL"],
          },
        },
      },
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: { dataInicio: dateTimeSchema, dataFim: dateTimeSchema },
      },
    },
  }, async (request) => service.runAnalysis(
    actor(request),
    request.params.categoria,
    request.query.dataInicio ? new Date(request.query.dataInicio) : undefined,
    request.query.dataFim ? new Date(request.query.dataFim) : undefined,
  ));

  app.get<{ Querystring: { categoria?: string } }>("/analises/resultados", {
    ...protectedRoute(app),
    schema: {
      summary: "Consulta resultados anteriores das analises",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: {
          categoria: {
            type: "string",
            enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "VIDA_UTIL"],
          },
        },
      },
    },
  }, async (request) => service.listAnalysisResults(actor(request), request.query.categoria));

  app.patch<{ Body: ParameterBody }>("/parametros-globais", {
    ...protectedRoute(app),
    schema: {
      summary: "Atualiza aliquotas e/ou coeficiente de depreciacao",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["version"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          aliquotasImpostos: { type: "object", additionalProperties: { type: "number", minimum: 0, maximum: 1 } },
          coeficienteDepreciacao: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  }, async (request) => service.updateParameters(actor(request), request.body));

  app.get("/parametros-globais", {
    ...protectedRoute(app),
    schema: { summary: "Consulta parametros globais", security: [{ bearerAuth: [] }] },
  }, async (request) => service.getParameters(actor(request)));

  app.get<{ Querystring: PeriodQuery; Params: IdParams }>("/relatorios/organizacoes/:id", {
    ...protectedRoute(app),
    schema: {
      summary: "Gera relatorio de lotes por organizacao e periodo",
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      querystring: {
        type: "object",
        required: ["dataInicio", "dataFim"],
        additionalProperties: false,
        properties: { dataInicio: dateTimeSchema, dataFim: dateTimeSchema },
      },
    },
  }, async (request) => {
    const organization = await service.getOrganization(actor(request), request.params.id);
    const lots = await service.listLots(
      actor(request),
      new Date(request.query.dataInicio ?? ""),
      new Date(request.query.dataFim ?? ""),
    );
    return { organizacao: organization, lotes: lots.filter((lot) => lot.organizacaoId === organization.id) };
  });
}

function actor(request: FastifyRequest): Actor {
  if (!request.identidade) {
    throw new ApiError(401, "Token invalido ou expirado.", "UNAUTHENTICATED");
  }
  return request.identidade;
}

function usuarioPublico<T extends { id: string; usuario: string; papel: string; version: number }>(
  user: T,
) {
  return { id: user.id, usuario: user.usuario, papel: user.papel, version: user.version };
}
