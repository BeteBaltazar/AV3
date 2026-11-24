import type { PapelUsuario } from "../domain/enums/PapelUsuario.js";

export interface UsuarioAutenticado {
  id: string;
  usuario: string;
  papel: PapelUsuario;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: PapelUsuario };
    user: { sub: string; role: PapelUsuario };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    identidade?: UsuarioAutenticado;
  }

  interface FastifyInstance {
    autenticar: import("fastify").preHandlerHookHandler;
  }
}
