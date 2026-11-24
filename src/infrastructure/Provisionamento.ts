import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CriptografiaArquivo } from "./CriptografiaArquivo.js";
import {
  EntidadePersistida,
  RepositorioArquivo,
} from "./RepositorioArquivo.js";

export interface ConfiguracaoMestre {
  versao: 1;
  chaveCriptografia: string;
  arquivoCredenciais: string;
  usuarioAdministradorInicial: string;
}

export type CriadorCredencial = (
  usuario: string,
  senha: string,
) => EntidadePersistida;

export class Provisionamento {
  private readonly caminhoConfiguracao: string;
  private readonly diretorioDados: string;

  public constructor(
    private readonly diretorioBase: string,
    private readonly criptografia: CriptografiaArquivo,
    private readonly criarCredencial: CriadorCredencial,
  ) {
    this.caminhoConfiguracao = join(
      this.diretorioBase,
      "configuracao-mestre.json",
    );
    this.diretorioDados = join(this.diretorioBase, "dados");
  }

  public configuracaoExiste(): boolean {
    return existsSync(this.caminhoConfiguracao);
  }

  public provisionar(
    usuarioAdministrador: string,
    solicitarSenha: () => string,
  ): ConfiguracaoMestre {
    if (this.configuracaoExiste()) {
      throw new Error("Sistema ja provisionado.");
    }

    const senha = solicitarSenha();

    if (!senha) {
      throw new Error("A senha do administrador nao pode ser vazia.");
    }

    const configuracao: ConfiguracaoMestre = {
      versao: 1,
      chaveCriptografia: this.criptografia.gerarChave(),
      arquivoCredenciais: "credenciais.json",
      usuarioAdministradorInicial: usuarioAdministrador,
    };
    const credencial = this.criarCredencial(usuarioAdministrador, senha);
    const repositorio = new RepositorioArquivo(
      this.diretorioDados,
      this.criptografia,
      configuracao.chaveCriptografia,
    );

    repositorio.salvarEntidade(configuracao.arquivoCredenciais, credencial);
    this.escreverConfiguracaoAtomica(configuracao);

    return configuracao;
  }

  private escreverConfiguracaoAtomica(configuracao: ConfiguracaoMestre): void {
    mkdirSync(this.diretorioBase, { recursive: true });
    const temporario = `${this.caminhoConfiguracao}.tmp-${randomUUID()}`;
    const dados = JSON.stringify(configuracao, null, 2);

    writeFileSync(temporario, dados, "utf8");
    renameSync(temporario, this.caminhoConfiguracao);
  }
}
