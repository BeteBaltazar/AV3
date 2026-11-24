import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CriptografiaArquivo } from "../infrastructure/CriptografiaArquivo.js";

const NOME_ARQUIVO_ATUAL = "journal-atual.enc";
const LIMITE_BYTES_PADRAO = 10 * 1024 * 1024;
const RETENCAO_DIAS_PADRAO = 180;

export interface DadosJournalTransacao {
  id: string;
  timestamp: Date | string;
  operacao: string;
  entidade: string;
  dadosAntes: unknown;
  dadosDepois: unknown;
  usuarioResponsavel: string;
}

export class JournalTransacao {
  public id: string;
  public timestamp: Date;
  public operacao: string;
  public entidade: string;
  public dadosAntes: unknown;
  public dadosDepois: unknown;
  public usuarioResponsavel: string;

  public constructor(
    dados: DadosJournalTransacao,
    private readonly diretorioBase: string,
    private readonly criptografia: CriptografiaArquivo,
    private readonly chave: string,
    private readonly limiteBytes = LIMITE_BYTES_PADRAO,
    private readonly retencaoDias = RETENCAO_DIAS_PADRAO,
    private readonly reverterOperacao?: () => boolean,
  ) {
    this.id = dados.id;
    this.timestamp = new Date(dados.timestamp);
    this.operacao = dados.operacao;
    this.entidade = dados.entidade;
    this.dadosAntes = dados.dadosAntes;
    this.dadosDepois = dados.dadosDepois;
    this.usuarioResponsavel = dados.usuarioResponsavel;
    mkdirSync(this.diretorioBase, { recursive: true });
  }

  public registrar(): void {
    const registrosAtuais = this.lerArquivoAtual();
    const novoRegistro = this.paraDados();
    const registrosComNovo = [...registrosAtuais, novoRegistro];
    const dadosCifrados = this.cifrarRegistros(registrosComNovo);

    if (
      registrosAtuais.length > 0 &&
      Buffer.byteLength(dadosCifrados, "utf8") > this.limiteBytes
    ) {
      this.rotacionarArquivoAtual();
      this.escreverAtomico(NOME_ARQUIVO_ATUAL, this.cifrarRegistros([novoRegistro]));
    } else {
      this.escreverAtomico(NOME_ARQUIVO_ATUAL, dadosCifrados);
    }

    this.limparArquivosAntigos();
  }

  public reverter(): boolean {
    return this.reverterOperacao?.() ?? false;
  }

  public listarRegistros(): DadosJournalTransacao[] {
    const arquivos = readdirSync(this.diretorioBase)
      .filter((arquivo) => arquivo.endsWith(".enc"))
      .sort();

    return arquivos.flatMap((arquivo) => this.lerArquivo(arquivo));
  }

  private paraDados(): DadosJournalTransacao {
    return {
      id: this.id,
      timestamp: this.timestamp.toISOString(),
      operacao: this.operacao,
      entidade: this.entidade,
      dadosAntes: this.dadosAntes,
      dadosDepois: this.dadosDepois,
      usuarioResponsavel: this.usuarioResponsavel,
    };
  }

  private lerArquivoAtual(): DadosJournalTransacao[] {
    if (!existsSync(join(this.diretorioBase, NOME_ARQUIVO_ATUAL))) {
      return [];
    }

    return this.lerArquivo(NOME_ARQUIVO_ATUAL);
  }

  private lerArquivo(nomeArquivo: string): DadosJournalTransacao[] {
    const caminho = join(this.diretorioBase, nomeArquivo);
    const dadosCifrados = readFileSync(caminho, "utf8");
    const dados = JSON.parse(
      this.criptografia.decifrar(dadosCifrados, this.chave),
    ) as unknown;

    if (!Array.isArray(dados)) {
      throw new Error(`Arquivo de journal invalido: ${nomeArquivo}`);
    }

    return dados as DadosJournalTransacao[];
  }

  private cifrarRegistros(registros: DadosJournalTransacao[]): string {
    return this.criptografia.cifrar(JSON.stringify(registros), this.chave);
  }

  private rotacionarArquivoAtual(): void {
    const atual = join(this.diretorioBase, NOME_ARQUIVO_ATUAL);
    const rotacionado = join(
      this.diretorioBase,
      `journal-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.enc`,
    );

    renameSync(atual, rotacionado);
  }

  private escreverAtomico(nomeArquivo: string, dados: string): void {
    const caminho = join(this.diretorioBase, nomeArquivo);
    const temporario = `${caminho}.tmp-${randomUUID()}`;

    let falhou = false;
    let erroOriginal: unknown;
    try {
      writeFileSync(temporario, dados, "utf8");
      renameSync(temporario, caminho);
    } catch (erro) {
      falhou = true;
      erroOriginal = erro;
    }

    if (existsSync(temporario)) {
      try {
        unlinkSync(temporario);
      } catch (erroLimpeza) {
        if (falhou) {
          throw new AggregateError(
            [erroOriginal, erroLimpeza],
            `Falha ao gravar ${nomeArquivo} e ao remover o arquivo temporario.`,
          );
        }
        throw erroLimpeza;
      }
    }

    if (falhou) {
      throw erroOriginal;
    }
  }

  private limparArquivosAntigos(): void {
    const limite = Date.now() - this.retencaoDias * 24 * 60 * 60 * 1000;

    for (const arquivo of readdirSync(this.diretorioBase)) {
      if (!arquivo.startsWith("journal-") || !arquivo.endsWith(".enc")) {
        continue;
      }

      const caminho = join(this.diretorioBase, arquivo);
      if (statSync(caminho).mtimeMs < limite) {
        unlinkSync(caminho);
      }
    }
  }
}
