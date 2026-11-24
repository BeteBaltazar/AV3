import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { ApiRepository } from "./repositories/ApiRepository.js";
import { GreencodeApiService } from "./services/GreencodeApiService.js";
import { handleApiError } from "./errors.js";
import { getDocumentedResponse } from "./openapi-responses.js";
import { registerApiRoutes } from "./routes.js";
import rateLimit from "@fastify/rate-limit";
import { registerPublicApiRoutes } from "./public-routes.js";
import type { ReportQueuePublisher } from "../queue/reportQueue.js";

export interface ApiAppOptions {
  jwtSecret: string;
  jwtExpiresIn: string;
  logger?: boolean;
  reportQueue?: ReportQueuePublisher;
}

export async function createApiApp(
  repository: ApiRepository,
  options: ApiAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  const service = new GreencodeApiService(repository);

  app.setErrorHandler(handleApiError);
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: { code: "NOT_FOUND", message: "Rota nao encontrada." },
    });
  });
  app.addHook("onRoute", (routeOptions) => {
    if (
      !routeOptions.schema ||
      routeOptions.url.startsWith("/documentation") ||
      routeOptions.method === "HEAD"
    ) {
      return;
    }
    const documentedResponse = getDocumentedResponse(
      Array.isArray(routeOptions.method) ? routeOptions.method[0] ?? "" : routeOptions.method,
      routeOptions.url,
    );
    routeOptions.schema = {
      ...routeOptions.schema,
      response: {
        [documentedResponse.status]: {
          description: documentedResponse.status === 201
            ? "Recurso criado."
            : documentedResponse.status === 204
              ? "Operacao concluida sem corpo de resposta."
              : "Operacao concluida.",
          ...documentedResponse.schema,
        },
        400: errorResponse("Dados invalidos."),
        401: errorResponse("Token ou credenciais invalidos."),
        403: errorResponse("Papel sem permissao para a operacao."),
        404: errorResponse("Recurso nao encontrado."),
        409: errorResponse("Conflito de unicidade, integridade ou versao."),
        500: errorResponse("Erro interno inesperado."),
      },
    };
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Greencode API",
        description: "API REST para logistica reversa de equipamentos eletronicos.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/documentation" });
  await app.register(jwt, { secret: options.jwtSecret });
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const apiKey = request.headers["x-api-key"];
      return typeof apiKey === "string" ? apiKey : request.ip;
    },
  });
  app.decorateRequest("identidade", undefined);
  app.decorate("autenticar", async (request) => {
    await request.jwtVerify();
    const identity = await service.authenticateUser(request.user.sub);
    request.identidade = identity;
  });

  app.get("/health", {
    schema: { summary: "Verifica se a API esta disponivel" },
  }, async () => ({ status: "ok" }));
  registerApiRoutes(app, service, options.jwtExpiresIn);
  registerPublicApiRoutes(app, service, options.reportQueue);

  return app;
}

function errorResponse(description: string) {
  return {
    description,
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  };
}
