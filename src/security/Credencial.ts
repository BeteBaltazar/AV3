import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { Autenticavel } from "./Autenticavel.js";

export interface DadosCredencial {
  usuario: string;
  hashSenha: string;
  salt: string;
  ultimoAcesso: Date | string;
  papel: PapelUsuario;
}

export interface CredencialPersistida extends DadosCredencial {
  id: string;
}

export class Credencial implements Autenticavel {
  public usuario: string;
  public hashSenha: string;
  public salt: string;
  public ultimoAcesso: Date;
  public papel: PapelUsuario;

  public constructor(dados: DadosCredencial) {
    this.usuario = dados.usuario.trim();
    this.hashSenha = dados.hashSenha;
    this.salt = dados.salt;
    this.ultimoAcesso = new Date(dados.ultimoAcesso);
    this.papel = dados.papel;
  }

  public static criar(
    usuario: string,
    senha: string,
    papel: PapelUsuario = PapelUsuario.ADMINISTRADOR,
  ): Credencial {
    const salt = randomBytes(16).toString("base64url");
    const hashSenha = Credencial.calcularHash(senha, salt);

    return new Credencial({
      usuario: usuario.trim(),
      hashSenha,
      salt,
      ultimoAcesso: new Date(0),
      papel,
    });
  }

  public autenticar(usuario: string, senha: string): boolean {
    const autenticado = this.usuario === usuario && this.verificarSenha(senha);

    if (autenticado) {
      this.atualizarUltimoAcesso();
    }

    return autenticado;
  }

  public verificarSenha(senhaPlana: string): boolean {
    const hashRecebido = Buffer.from(
      Credencial.calcularHash(senhaPlana, this.salt),
      "hex",
    );
    const hashArmazenado = Buffer.from(this.hashSenha, "hex");

    return (
      hashRecebido.length === hashArmazenado.length &&
      timingSafeEqual(hashRecebido, hashArmazenado)
    );
  }

  public atualizarUltimoAcesso(): void {
    this.ultimoAcesso = new Date();
  }

  public atualizarSenha(senha: string): void {
    this.salt = randomBytes(16).toString("base64url");
    this.hashSenha = Credencial.calcularHash(senha, this.salt);
  }

  public renovarToken(): string {
    return randomUUID();
  }

  public paraPersistencia(): CredencialPersistida {
    return {
      id: this.usuario,
      usuario: this.usuario,
      hashSenha: this.hashSenha,
      salt: this.salt,
      ultimoAcesso: this.ultimoAcesso.toISOString(),
      papel: this.papel,
    };
  }

  private static calcularHash(senha: string, salt: string): string {
    return createHash("sha256")
      .update(`${salt}:${senha}`, "utf8")
      .digest("hex");
  }
}
