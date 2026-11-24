import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as readline from "node:readline";
import { DadosEquipamento, Equipamento } from "../domain/entities/Equipamento.js";
import { DadosLote } from "../domain/entities/Lote.js";
import { DadosOrganizacao } from "../domain/entities/Organizacao.js";
import { EstadoFisico } from "../domain/enums/EstadoFisico.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { StatusRastreamento } from "../domain/enums/StatusRastreamento.js";
import { TipoEquipamento } from "../domain/enums/TipoEquipamento.js";
import { StatusLote } from "../domain/enums/StatusLote.js";
import { ServicoEquipamento } from "../services/ServicoEquipamento.js";
import { ServicoLote } from "../services/ServicoLote.js";
import { ServicoOrganizacao } from "../services/ServicoOrganizacao.js";
import { ServicoRelatorio } from "../services/ServicoRelatorio.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { ServicoAutenticacao } from "../security/ServicoAutenticacao.js";
import { Sessao } from "../security/Sessao.js";
import { Permissao } from "../security/Permissao.js";
import { ServicoParametrosGlobais } from "../services/ServicoParametrosGlobais.js";

const COMANDOS = [
  "login",
  "logout",
  "menu",
  "usuario",
  "parametro",
  "organizacao",
  "contrato",
  "lote",
  "equipamento",
  "relatorio",
  "codigo",
  "ajuda",
  "sair",
];

const COMANDOS_POR_PERMISSAO: ReadonlyArray<{
  permissao: Permissao;
  comando: string;
}> = [
  { permissao: Permissao.CADASTRAR_ORGANIZACAO, comando: "organizacao cadastrar" },
  { permissao: Permissao.CADASTRAR_ORGANIZACAO, comando: "organizacao listar" },
  { permissao: Permissao.CONSULTAR_HISTORICOS, comando: "organizacao listar" },
  { permissao: Permissao.GERENCIAR_CONTRATOS, comando: "contrato criar" },
  { permissao: Permissao.CONFIGURAR_PARAMETROS_GLOBAIS, comando: "parametro listar" },
  { permissao: Permissao.CONFIGURAR_ALIQUOTAS_IMPOSTOS, comando: "parametro configurar-aliquota" },
  { permissao: Permissao.CONFIGURAR_DEPRECIACAO, comando: "parametro configurar-depreciacao" },
  { permissao: Permissao.GERENCIAR_CONTAS, comando: "usuario listar" },
  { permissao: Permissao.GERENCIAR_CONTAS, comando: "usuario criar" },
  { permissao: Permissao.GERENCIAR_CONTAS, comando: "usuario editar" },
  { permissao: Permissao.GERENCIAR_CONTAS, comando: "usuario excluir" },
  { permissao: Permissao.DESATIVAR_ORGANIZACAO, comando: "organizacao desativar" },
  { permissao: Permissao.APAGAR_ORGANIZACAO, comando: "organizacao apagar" },
  { permissao: Permissao.REGISTRAR_CHEGADA_LOTE, comando: "lote criar" },
  { permissao: Permissao.EXCLUIR_LOTE, comando: "lote excluir" },
  { permissao: Permissao.TRIAR_EQUIPAMENTO, comando: "lote triar" },
  { permissao: Permissao.TRIAR_EQUIPAMENTO, comando: "equipamento desmonte" },
  { permissao: Permissao.REGISTRAR_CHEGADA_LOTE, comando: "equipamento cadastrar" },
  { permissao: Permissao.REGISTRAR_CHEGADA_LOTE, comando: "equipamento desvincular" },
  { permissao: Permissao.GERENCIAR_CONTAS, comando: "equipamento apagar" },
  { permissao: Permissao.ALOCAR_CODIGO_BARRAS, comando: "codigo gerar" },
  { permissao: Permissao.CONSULTAR_HISTORICOS, comando: "equipamento rastrear" },
  { permissao: Permissao.GERAR_RELATORIOS, comando: "relatorio gerar" },
  { permissao: Permissao.GERAR_RELATORIOS, comando: "equipamento depreciacao" },
];

const COMANDOS_BASICOS = ["menu", "ajuda", "logout", "sair"];

export class CLIInterface {
  public sessaoAtual: Sessao | null = null;
  private readonly caminhoHistorico: string;
  private interfaceLinha: readline.Interface | null = null;

  public constructor(
    public readonly autenticacao: ServicoAutenticacao,
    public readonly organizacao: ServicoOrganizacao,
    public readonly lote: ServicoLote,
    public readonly equipamento: ServicoEquipamento,
    public readonly relatorio: ServicoRelatorio,
    private readonly controlePermissoes: ControlePermissoes,
    caminhoHistorico = ".greencode/historico.txt",
    private readonly parametrosGlobais?: ServicoParametrosGlobais,
  ) {
    this.caminhoHistorico = caminhoHistorico;
  }

  private processarUsuario(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    const sessao = this.exigirSessaoAtiva();
    const acao = argumentos[0];

    if (acao === "listar") {
      console.log(JSON.stringify(this.autenticacao.listarUsuarios(sessao.token)));
      return;
    }

    if (acao === "criar") {
      const papel = this.obterPapelUsuario(this.obterObrigatorio(opcoes, "papel"));
      const credencial = this.autenticacao.criarUsuario(
        sessao.token,
        this.obterObrigatorio(opcoes, "usuario"),
        this.obterObrigatorio(opcoes, "senha"),
        papel,
      );
      console.log(
        `[SUCESSO] Usuario ${credencial.usuario} criado com papel ${credencial.papel}.`,
      );
      return;
    }

    if (acao === "editar") {
      const alteracoes: { senha?: string; papel?: PapelUsuario } = {};
      const senha = opcoes.get("senha");
      const papel = opcoes.get("papel");
      if (senha !== undefined) {
        alteracoes.senha = senha;
      }
      if (papel !== undefined) {
        alteracoes.papel = this.obterPapelUsuario(papel);
      }
      const credencial = this.autenticacao.editarUsuario(
        sessao.token,
        this.obterObrigatorio(opcoes, "usuario"),
        alteracoes,
      );
      console.log(
        `[SUCESSO] Usuario ${credencial.usuario} atualizado.`,
      );
      return;
    }

    if (acao === "excluir") {
      const usuario = this.obterObrigatorio(opcoes, "usuario");
      this.autenticacao.excluirUsuario(sessao.token, usuario);
      console.log(`[SUCESSO] Usuario ${usuario} excluido.`);
      return;
    }

    throw new Error("Uso: usuario listar|criar|editar|excluir com argumentos nomeados.");
  }

  public iniciarLoop(): void {
    const interfaceLinha = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 100,
      completer: (linha: string) => this.completar(linha),
    });
    const interfaceComHistorico = interfaceLinha as readline.Interface & {
      history: string[];
    };
    this.interfaceLinha = interfaceLinha;

    interfaceComHistorico.history = this.carregarHistorico();
    interfaceLinha.setPrompt("greencode> ");
    interfaceLinha.prompt();

    interfaceLinha.on("line", (entrada) => {
      this.processarComando(entrada);
      interfaceLinha.prompt();
    });

    interfaceLinha.on("close", () => {
      this.salvarHistorico(interfaceComHistorico.history);
      this.interfaceLinha = null;
    });
  }

  private obterPapelUsuario(valor: string): PapelUsuario {
    const papel = Object.values(PapelUsuario).find(
      (item) => item === valor.trim().toUpperCase(),
    );

    if (!papel) {
      throw new Error(`Papel invalido. Use: ${Object.values(PapelUsuario).join(", ")}.`);
    }

    return papel;
  }

  public processarComando(entrada: string): void {
    const partes = entrada.trim().split(/\s+/).filter(Boolean);

    if (partes.length === 0) {
      return;
    }

    const [comando, ...argumentos] = partes;
    const opcoes = this.interpretarArgumentos(argumentos);

    try {
      switch (comando) {
        case "login":
          this.processarLogin(argumentos, opcoes);
          break;
        case "logout":
          this.processarLogout();
          break;
        case "menu":
          this.exibirMenuAtual();
          break;
        case "ajuda":
          this.exibirAjuda();
          break;
        case "organizacao":
          this.processarOrganizacao(argumentos, opcoes);
          break;
        case "contrato":
          this.processarContrato(argumentos, opcoes);
          break;
        case "usuario":
          this.processarUsuario(argumentos, opcoes);
          break;
        case "parametro":
          this.processarParametro(argumentos, opcoes);
          break;
        case "lote":
          this.processarLote(argumentos, opcoes);
          break;
        case "equipamento":
          this.processarEquipamento(argumentos, opcoes);
          break;
        case "relatorio":
          this.processarRelatorio(argumentos, opcoes);
          break;
        case "codigo":
          this.processarCodigo(argumentos, opcoes);
          break;
        case "sair":
          this.encerrarLoop();
          break;
        default:
          console.log(`Comando desconhecido: ${comando}`);
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido.";
      console.log(`[ERRO] ${mensagem}`);
    }
  }

  public exibirMenuPorPapel(papel: PapelUsuario): void {
    console.log(`Papel: ${papel}`);
    console.log("Comandos disponiveis:");

    for (const comando of COMANDOS_BASICOS) {
      console.log(`- ${comando}`);
    }

    const comandosExibidos = new Set<string>();
    for (const item of COMANDOS_POR_PERMISSAO) {
      if (this.controlePermissoes.temPermissao(papel, item.permissao)) {
        comandosExibidos.add(item.comando);
      }
    }
    for (const comando of comandosExibidos) {
      console.log(`- ${comando}`);
    }
  }

  private processarLogin(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    const usuario = opcoes.get("usuario") ?? argumentos[0];
    const senha = opcoes.get("senha") ?? argumentos[1];

    if (!usuario || !senha) {
      throw new Error("Uso: login <usuario> <senha> ou login --usuario X --senha Y");
    }

    this.sessaoAtual = this.autenticacao.login(usuario, senha);
    this.organizacao.definirPapel(this.sessaoAtual.papel);
    this.lote.definirPapel(this.sessaoAtual.papel);
    this.equipamento.definirPapel(this.sessaoAtual.papel);
    this.relatorio.definirPapel(this.sessaoAtual.papel);
    this.parametrosGlobais?.definirPapel(this.sessaoAtual.papel);
    console.log(`[SUCESSO] Login realizado para ${usuario}.`);
    this.exibirMenuPorPapel(this.sessaoAtual.papel);
  }

  private processarLogout(): void {
    if (!this.sessaoAtual) {
      console.log("[AVISO] Nenhuma sessao ativa.");
      return;
    }

    this.autenticacao.logout(this.sessaoAtual.token);
    this.sessaoAtual = null;
    console.log("[SUCESSO] Logout realizado.");
  }

  private exibirMenuAtual(): void {
    if (!this.sessaoAtual || !this.autenticacao.validarToken(this.sessaoAtual.token)) {
      throw new Error("Sessao invalida ou expirada.");
    }

    this.exibirMenuPorPapel(this.sessaoAtual.papel);
  }

  private exibirAjuda(): void {
    console.log("Comandos: login, logout, menu, usuario listar|criar|editar|excluir, parametro listar|configurar-aliquota|configurar-depreciacao, organizacao, contrato, lote, equipamento, relatorio, codigo, ajuda, sair.");
    console.log("Argumentos nomeados: --nome valor ou --nome=valor.");
  }

  private encerrarLoop(): void {
    console.log("Encerrando greencode.");
    this.interfaceLinha?.close();
  }

  private processarOrganizacao(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    this.exigirSessaoAtiva();
    const acao = argumentos[0];

    if (acao === "listar") {
      console.log(JSON.stringify(this.organizacao.listarOrganizacoesAtivas()));
      return;
    }

    if (acao === "buscar") {
      console.log(JSON.stringify(this.organizacao.buscarOrganizacao(this.obterObrigatorio(opcoes, "id"))));
      return;
    }

    if (acao === "desativar") {
      this.organizacao.desativarOrganizacao(this.obterObrigatorio(opcoes, "id"));
      console.log("[SUCESSO] Organizacao desativada.");
      return;
    }

    if (acao === "apagar") {
      this.organizacao.apagarOrganizacao(this.obterObrigatorio(opcoes, "id"));
      console.log("[SUCESSO] Organizacao apagada.");
      return;
    }

    if (acao === "cadastrar") {
      const dados: DadosOrganizacao = {
        id: opcoes.get("id") ?? "",
        razaoSocial: this.obterObrigatorio(opcoes, "razaoSocial"),
        cnpj: this.obterObrigatorio(opcoes, "cnpj"),
        inscricaoEstadual: this.obterObrigatorio(opcoes, "inscricaoEstadual"),
        enderecoCompleto: this.obterObrigatorio(opcoes, "endereco"),
        telefone: this.obterObrigatorio(opcoes, "telefone"),
        email: this.obterObrigatorio(opcoes, "email"),
        dataCadastro: new Date(),
        ativo: true,
        contratoVigente: false,
      };
      console.log(JSON.stringify(this.organizacao.cadastrarOrganizacao(dados)));
      return;
    }

    throw new Error("Uso: organizacao listar|buscar --id X|cadastrar --razaoSocial X ...");
  }

  private processarLote(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    const sessao = this.exigirSessaoAtiva();
    const acao = argumentos[0];

    if (acao === "consultar") {
      const inicio = new Date(this.obterObrigatorio(opcoes, "inicio"));
      const fim = new Date(this.obterObrigatorio(opcoes, "fim"));
      console.log(JSON.stringify(this.lote.consultarLotePorPeriodo(inicio, fim)));
      return;
    }

    if (acao === "criar") {
      const dados: DadosLote = {
        id: this.obterObrigatorio(opcoes, "id"),
        dataEntrada: new Date(this.obterObrigatorio(opcoes, "dataEntrada")),
        organizacaoId: this.obterObrigatorio(opcoes, "org"),
        notaFiscal: this.obterObrigatorio(opcoes, "nf"),
        transportadora: this.obterObrigatorio(opcoes, "transp"),
        statusProcessamento: StatusLote.RECEBIDO,
        observacoes: opcoes.get("observacoes") ?? "",
      };
      console.log(JSON.stringify(this.lote.criarLote(dados)));
      return;
    }

    if (acao === "triar") {
      this.lote.processarTriagem(
        this.obterObrigatorio(opcoes, "id"),
        sessao.usuario,
      );
      console.log("[SUCESSO] Triagem processada.");
      return;
    }

    if (acao === "excluir") {
      this.lote.excluirLote(this.obterObrigatorio(opcoes, "id"));
      console.log("[SUCESSO] Lote excluido.");
      return;
    }

    throw new Error("Uso: lote criar|triar|consultar com argumentos nomeados.");
  }

  private processarContrato(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    this.exigirSessaoAtiva();
    if (argumentos[0] !== "criar") {
      throw new Error("Uso: contrato criar --org X --dataAssinatura ISO --dataVencimento ISO --clausulas texto --valorMensal N --renovacaoAutomatica true|false");
    }

    const renovacaoAutomatica = this.obterObrigatorio(
      opcoes,
      "renovacaoAutomatica",
    ).toLowerCase();
    if (renovacaoAutomatica !== "true" && renovacaoAutomatica !== "false") {
      throw new Error("Informe --renovacaoAutomatica como true ou false.");
    }
    const valorMensal = Number(this.obterObrigatorio(opcoes, "valorMensal"));
    if (!Number.isFinite(valorMensal)) {
      throw new Error("--valorMensal deve ser um numero valido.");
    }

    const contrato = this.organizacao.criarContrato({
      id: opcoes.get("id") ?? "",
      organizacaoId: this.obterObrigatorio(opcoes, "org"),
      dataAssinatura: new Date(this.obterObrigatorio(opcoes, "dataAssinatura")),
      dataVencimento: new Date(this.obterObrigatorio(opcoes, "dataVencimento")),
      clausulas: this.obterObrigatorio(opcoes, "clausulas"),
      valorMensal,
      renovacaoAutomatica: renovacaoAutomatica === "true",
    });
    console.log(`[SUCESSO] Contrato ${contrato.id} criado para a organizacao ${contrato.organizacaoId}.`);
  }

  private processarParametro(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    this.exigirSessaoAtiva();
    if (!this.parametrosGlobais) {
      throw new Error("Servico de parametros globais nao esta configurado.");
    }

    const acao = argumentos[0];
    if (acao === "listar") {
      console.log(JSON.stringify(this.parametrosGlobais.listar()));
      return;
    }

    if (acao === "configurar-aliquota") {
      const aliquota = Number(this.obterObrigatorio(opcoes, "valor"));
      this.parametrosGlobais.configurarAliquotaImposto(
        this.obterObrigatorio(opcoes, "imposto"),
        aliquota,
      );
      console.log("[SUCESSO] Aliquota de imposto configurada.");
      return;
    }

    if (acao === "configurar-depreciacao") {
      const coeficiente = Number(
        this.obterObrigatorio(opcoes, "coeficiente"),
      );
      this.parametrosGlobais.configurarCoeficienteDepreciacao(coeficiente);
      console.log("[SUCESSO] Coeficiente de depreciacao configurado.");
      return;
    }

    throw new Error(
      "Uso: parametro listar|configurar-aliquota|configurar-depreciacao.",
    );
  }

  private processarEquipamento(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    const sessao = this.exigirSessaoAtiva();
    if (argumentos[0] === "desmonte") {
      this.equipamento.movimentarParaDesmonte(
        this.obterObrigatorio(opcoes, "id"),
        sessao.usuario,
      );
      console.log("[SUCESSO] Equipamento movimentado para desmonte.");
      return;
    }

    if (argumentos[0] === "desvincular") {
      this.equipamento.desvincularEquipamento(this.obterObrigatorio(opcoes, "id"));
      console.log("[SUCESSO] Equipamento desvinculado.");
      return;
    }

    if (argumentos[0] === "apagar") {
      this.equipamento.apagarEquipamento(this.obterObrigatorio(opcoes, "id"));
      console.log("[SUCESSO] Equipamento apagado.");
      return;
    }

    if (argumentos[0] === "depreciacao") {
      const valor = this.equipamento.calcularDepreciacao(
        this.obterObrigatorio(opcoes, "id"),
      );
      console.log(`[SUCESSO] Depreciacao calculada: ${valor}.`);
      return;
    }

    if (argumentos[0] === "cadastrar") {
      const dados: DadosEquipamento = {
        id: this.obterObrigatorio(opcoes, "id"),
        codigoBarrasInterno: this.obterObrigatorio(opcoes, "codigo"),
        tipo: this.obterObrigatorio(opcoes, "tipo") as TipoEquipamento,
        marca: this.obterObrigatorio(opcoes, "marca"),
        modelo: this.obterObrigatorio(opcoes, "modelo"),
        anoFabricacao: Number(this.obterObrigatorio(opcoes, "ano")),
        estadoFisico: (opcoes.get("estado") ?? EstadoFisico.NOVO) as EstadoFisico,
        pesoQuilogramas: Number(this.obterObrigatorio(opcoes, "peso")),
        loteId: this.obterObrigatorio(opcoes, "lote"),
        posicaoNoLote: 0,
        statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
      };
      this.lote.adicionarEquipamentoLote(dados.loteId, new Equipamento(dados));
      console.log("[SUCESSO] Equipamento cadastrado.");
      return;
    }

    if (argumentos[0] !== "rastrear") {
      throw new Error(
        "Uso: equipamento cadastrar|rastrear|desmonte com argumentos nomeados",
      );
    }

    console.log(JSON.stringify(this.equipamento.rastrearEquipamento(this.obterObrigatorio(opcoes, "id"))));
  }

  private processarRelatorio(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    this.exigirSessaoAtiva();
    if (argumentos[0] !== "status") {
      throw new Error("Uso: relatorio status --status X");
    }

    const statusInformado = opcoes.get("status") ?? argumentos[1];
    if (!statusInformado) {
      throw new Error("Informe --status ou o status como segundo argumento.");
    }

    const status = this.obterStatusRastreamento(statusInformado);
    const resultado = this.relatorio.gerarRelatorioPorStatus(status);
    console.log(resultado);
  }

  private obterStatusRastreamento(valor: string): StatusRastreamento {
    const status = Object.values(StatusRastreamento).find(
      (item) => item === valor.trim().toUpperCase(),
    );

    if (!status) {
      throw new Error(
        `Status invalido. Use: ${Object.values(StatusRastreamento).join(", ")}.`,
      );
    }

    return status;
  }

  private processarCodigo(
    argumentos: string[],
    opcoes: ReadonlyMap<string, string>,
  ): void {
    this.exigirSessaoAtiva();
    if (argumentos[0] !== "gerar") {
      throw new Error("Uso: codigo gerar --tipo X --sequencia N");
    }

    console.log(this.equipamento.gerarCodigoBarras(
      this.obterObrigatorio(opcoes, "tipo") as TipoEquipamento,
      Number(this.obterObrigatorio(opcoes, "sequencia")),
    ));
  }

  private exigirSessaoAtiva(): Sessao {
    if (!this.sessaoAtual || !this.autenticacao.validarToken(this.sessaoAtual.token)) {
      throw new Error("Sessao invalida ou expirada.");
    }

    return this.sessaoAtual;
  }

  private obterObrigatorio(
    opcoes: ReadonlyMap<string, string>,
    nome: string,
  ): string {
    const valor = opcoes.get(nome);
    if (!valor) {
      throw new Error(`Argumento obrigatorio ausente: --${nome}`);
    }
    return valor;
  }

  private interpretarArgumentos(argumentos: string[]): Map<string, string> {
    const opcoes = new Map<string, string>();

    for (let indice = 0; indice < argumentos.length; indice += 1) {
      const argumento = argumentos[indice];
      if (!argumento?.startsWith("--")) {
        continue;
      }

      const [nome, valorInline] = argumento.slice(2).split("=", 2);
      let valor = valorInline ?? argumentos[indice + 1];
      if (nome && valor && !valor.startsWith("--")) {
        if (nome === "clausulas") {
          const clausulas = [valor];
          if (valorInline === undefined) {
            indice += 1;
          }
          while (
            indice + 1 < argumentos.length &&
            !argumentos[indice + 1]?.startsWith("--")
          ) {
            indice += 1;
            clausulas.push(argumentos[indice]!);
          }
          valor = clausulas.join(" ");
        } else if (valorInline === undefined) {
          indice += 1;
        }
        opcoes.set(nome, valor);
      }
    }

    return opcoes;
  }

  private completar(linha: string): [string[], string] {
    const correspondencias = COMANDOS.filter((comando) =>
      comando.startsWith(linha),
    );
    return [correspondencias.length > 0 ? correspondencias : COMANDOS, linha];
  }

  private carregarHistorico(): string[] {
    if (!existsSync(this.caminhoHistorico)) {
      return [];
    }

    return this.filtrarHistoricoSensivel(readFileSync(this.caminhoHistorico, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .reverse());
  }

  private salvarHistorico(historico: string[]): void {
    mkdirSync(dirname(this.caminhoHistorico), { recursive: true });
    writeFileSync(
      this.caminhoHistorico,
      this.filtrarHistoricoSensivel(historico.filter(Boolean))
        .reverse()
        .join("\n"),
      "utf8",
    );
  }

  private filtrarHistoricoSensivel(historico: string[]): string[] {
    return historico.filter((entrada) => {
      const [comando] = entrada.trim().split(/\s+/, 1);
      return comando !== "login" && comando !== "usuario";
    });
  }
}
