import { Prisma } from "@prisma/client";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export class ApiError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleApiError(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ApiError) {
    reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      reply.status(409).send({
        error: { code: "CONFLICT", message: "Um identificador unico ja esta em uso." },
      });
      return;
    }
    if (error.code === "P2003") {
      reply.status(409).send({
        error: { code: "REFERENCE_CONFLICT", message: "O registro possui relacionamentos que impedem a operacao." },
      });
      return;
    }
    if (error.code === "P2025") {
      reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Recurso nao encontrado." },
      });
      return;
    }
    if (error.code === "P2034") {
      reply.status(409).send({
        error: { code: "VERSION_CONFLICT", message: "O recurso foi alterado por outra requisicao. Recarregue os dados." },
      });
      return;
    }
  }

  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  if (statusCode === 401) {
    reply.status(401).send({
      error: { code: "UNAUTHENTICATED", message: "Token invalido ou expirado." },
    });
    return;
  }

  if (statusCode === 429) {
    reply.status(429).send({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Limite de requisicoes excedido. Tente novamente mais tarde.",
      },
    });
    return;
  }

  if (error instanceof Error && "validation" in error) {
    reply.status(400).send({
      error: { code: "INVALID_REQUEST", message: "Os dados da requisicao sao invalidos." },
    });
    return;
  }

  request.log.error({ err: error }, "Falha inesperada ao processar requisicao");
  reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: "Erro interno inesperado." },
  });
}
