import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CriptografiaArquivo } from "./CriptografiaArquivo.js";

export type EntidadePersistida = Record<string, unknown> & { id: string };

export class RepositorioArquivo {
  public constructor(
    private readonly diretorioBase: string,
    private readonly criptografia: CriptografiaArquivo,
    private readonly chave: string,
  ) {
    mkdirSync(this.diretorioBase, { recursive: true });
  }

  public salvarEntidade(
    nomeArquivo: string,
    entidade: EntidadePersistida,
  ): void {
    const entidades = this.listarEntidades(nomeArquivo);
    const indice = entidades.findIndex(({ id }) => id === entidade.id);

    if (indice >= 0) {
      entidades[indice] = entidade;
    } else {
      entidades.push(entidade);
    }

    this.escreverAtomico(nomeArquivo, JSON.stringify(entidades));
  }

  public carregarEntidade(
    nomeArquivo: string,
    id: string,
  ): EntidadePersistida | undefined {
    return this.listarEntidades(nomeArquivo).find(
      (entidade) => entidade.id === id,
    );
  }

  public listarEntidades(nomeArquivo: string): EntidadePersistida[] {
    this.limparTemporariosOrfaos(nomeArquivo);
    const caminho = this.obterCaminho(nomeArquivo);

    if (!existsSync(caminho)) {
      return [];
    }

    const dadosCifrados = readFileSync(caminho, "utf8");
    const dados = this.criptografia.decifrar(dadosCifrados, this.chave);
    const entidades: unknown = JSON.parse(dados);

    if (!Array.isArray(entidades)) {
      throw new Error(`Arquivo de entidades invalido: ${nomeArquivo}`);
    }

    return entidades as EntidadePersistida[];
  }

  public excluirEntidade(nomeArquivo: string, id: string): void {
    const entidades = this.listarEntidades(nomeArquivo);
    const entidadesRestantes = entidades.filter((entidade) => entidade.id !== id);

    if (entidadesRestantes.length !== entidades.length) {
      this.escreverAtomico(nomeArquivo, JSON.stringify(entidadesRestantes));
    }
  }

  public limparTemporariosOrfaos(nomeArquivo?: string): void {
    const prefixo = nomeArquivo ? `${nomeArquivo}.tmp-` : undefined;

    for (const arquivo of readdirSync(this.diretorioBase)) {
      if (prefixo && !arquivo.startsWith(prefixo)) {
        continue;
      }

      if (!prefixo && !arquivo.includes(".tmp-")) {
        continue;
      }

      unlinkSync(join(this.diretorioBase, arquivo));
    }
  }

  private escreverAtomico(nomeArquivo: string, dados: string): void {
    const caminho = this.obterCaminho(nomeArquivo);
    const caminhoTemporario = `${caminho}.tmp-${randomUUID()}`;
    const dadosCifrados = this.criptografia.cifrar(dados, this.chave);

    try {
      writeFileSync(caminhoTemporario, dadosCifrados, "utf8");
      renameSync(caminhoTemporario, caminho);
    } finally {
      if (existsSync(caminhoTemporario)) {
        unlinkSync(caminhoTemporario);
      }
    }
  }

  private obterCaminho(nomeArquivo: string): string {
    return join(this.diretorioBase, nomeArquivo);
  }
}
