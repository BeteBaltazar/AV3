import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DadosCredencial, Credencial } from "../security/Credencial.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { ServicoAutenticacao } from "../security/ServicoAutenticacao.js";
import { ValidadorCNPJ } from "../domain/validators/ValidadorCNPJ.js";
import { ValidadorDataEntrada } from "../domain/validators/ValidadorDataEntrada.js";
import { ValidadorEstadoFisico } from "../domain/validators/ValidadorEstadoFisico.js";
import { CriptografiaArquivo } from "../infrastructure/CriptografiaArquivo.js";
import { RepositorioArquivo } from "../infrastructure/RepositorioArquivo.js";
import { RegistradorJournal } from "../audit/RegistradorJournal.js";
import { ServicoEquipamento } from "../services/ServicoEquipamento.js";
import { ServicoLote } from "../services/ServicoLote.js";
import { ServicoOrganizacao } from "../services/ServicoOrganizacao.js";
import { ServicoRelatorio } from "../services/ServicoRelatorio.js";
import { ServicoParametrosGlobais } from "../services/ServicoParametrosGlobais.js";
import { CLIInterface } from "../presentation/CLIInterface.js";
import { ConfiguracaoMestre } from "../infrastructure/Provisionamento.js";

export interface AplicacaoIntegrada {
  cli: CLIInterface;
  autenticacao: ServicoAutenticacao;
  repositorio: RepositorioArquivo;
  journal: RegistradorJournal;
  parametrosGlobais: ServicoParametrosGlobais;
}

export function criarAplicacao(
  diretorioBase: string,
  papel: PapelUsuario = PapelUsuario.ADMINISTRADOR,
): AplicacaoIntegrada {
  const configuracao = carregarConfiguracao(diretorioBase);
  const criptografia = new CriptografiaArquivo();
  const repositorio = new RepositorioArquivo(
    join(diretorioBase, "dados"),
    criptografia,
    configuracao.chaveCriptografia,
  );
  const controlePermissoes = new ControlePermissoes();
  const credenciais = repositorio
    .listarEntidades(configuracao.arquivoCredenciais)
    .map((dados) => new Credencial(dados as unknown as DadosCredencial));
  const journal = new RegistradorJournal(
    join(diretorioBase, "journal"),
    criptografia,
    configuracao.chaveCriptografia,
  );
  const autenticacao = new ServicoAutenticacao(
    credenciais,
    journal,
    controlePermissoes,
    repositorio,
    configuracao.arquivoCredenciais,
  );
  const parametrosGlobais = new ServicoParametrosGlobais(
    repositorio,
    controlePermissoes,
    papel,
    journal,
  );
  const organizacao = new ServicoOrganizacao(
    repositorio,
    new ValidadorCNPJ(),
    controlePermissoes,
    papel,
    journal,
  );
  const lote = new ServicoLote(
    repositorio,
    new ValidadorDataEntrada(),
    controlePermissoes,
    papel,
    journal,
  );
  const equipamento = new ServicoEquipamento(
    repositorio,
    new ValidadorEstadoFisico(),
    controlePermissoes,
    papel,
    journal,
    parametrosGlobais,
  );
  const relatorio = new ServicoRelatorio(
    repositorio,
    controlePermissoes,
    papel,
  );

  return {
    cli: new CLIInterface(
      autenticacao,
      organizacao,
      lote,
      equipamento,
      relatorio,
      controlePermissoes,
      join(diretorioBase, ".greencode", "historico.txt"),
      parametrosGlobais,
    ),
    autenticacao,
    repositorio,
    journal,
    parametrosGlobais,
  };
}

function carregarConfiguracao(diretorioBase: string): ConfiguracaoMestre {
  const caminho = join(diretorioBase, "configuracao-mestre.json");

  if (!existsSync(caminho)) {
    throw new Error("Configuracao mestre nao encontrada. Execute o provisionamento.");
  }

  return JSON.parse(readFileSync(caminho, "utf8")) as ConfiguracaoMestre;
}
