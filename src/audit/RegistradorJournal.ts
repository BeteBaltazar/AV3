import { randomUUID } from "node:crypto";
import {
  DadosJournalTransacao,
  JournalTransacao,
} from "./JournalTransacao.js";
import { CriptografiaArquivo } from "../infrastructure/CriptografiaArquivo.js";

export type DadosNovoRegistro = Omit<
  DadosJournalTransacao,
  "id" | "timestamp"
>;

export class RegistradorJournal {
  public constructor(
    private readonly diretorioBase: string,
    private readonly criptografia: CriptografiaArquivo,
    private readonly chave: string,
  ) {}

  public registrar(dados: DadosNovoRegistro): void {
    const transacao = new JournalTransacao(
      {
        ...dados,
        id: randomUUID(),
        timestamp: new Date(),
      },
      this.diretorioBase,
      this.criptografia,
      this.chave,
    );

    transacao.registrar();
  }
}
