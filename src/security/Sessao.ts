import { randomUUID } from "node:crypto";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { Autenticavel } from "./Autenticavel.js";

export const DURACAO_SESSAO_MS = 30 * 60 * 1000;

export class Sessao implements Autenticavel {
  public token: string;
  public usuario: string;
  public papel: PapelUsuario;
  public criacao: Date;
  public expiracao: Date;

  public constructor(
    usuario: string,
    papel: PapelUsuario,
    agora = new Date(),
  ) {
    this.token = randomUUID();
    this.usuario = usuario;
    this.papel = papel;
    this.criacao = new Date(agora);
    this.expiracao = new Date(agora.getTime() + DURACAO_SESSAO_MS);
  }

  public autenticar(usuario: string, _senha: string): boolean {
    const autenticada = this.usuario === usuario && this.isValida();

    if (autenticada) {
      this.renovar();
    }

    return autenticada;
  }

  public isValida(): boolean {
    return Date.now() < this.expiracao.getTime();
  }

  public renovar(): void {
    this.expiracao = new Date(Date.now() + DURACAO_SESSAO_MS);
  }

  public renovarToken(): string {
    this.token = randomUUID();
    this.renovar();
    return this.token;
  }
}
