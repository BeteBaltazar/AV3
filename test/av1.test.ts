import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JournalTransacao } from "../src/audit/JournalTransacao.js";
import { criarAplicacao } from "../src/integration/ComposicaoAplicacao.js";
import { CriptografiaArquivo } from "../src/infrastructure/CriptografiaArquivo.js";
import { Provisionamento } from "../src/infrastructure/Provisionamento.js";
import { RepositorioArquivo } from "../src/infrastructure/RepositorioArquivo.js";
import { Equipamento } from "../src/domain/entities/Equipamento.js";
import { ServicoEquipamento } from "../src/services/ServicoEquipamento.js";
import { ServicoLote } from "../src/services/ServicoLote.js";
import { ServicoOrganizacao } from "../src/services/ServicoOrganizacao.js";
import { CLIInterface } from "../src/presentation/CLIInterface.js";
import { ServicoRelatorio } from "../src/services/ServicoRelatorio.js";
import { EstadoFisico } from "../src/domain/enums/EstadoFisico.js";
import { PapelUsuario } from "../src/domain/enums/PapelUsuario.js";
import { StatusRastreamento } from "../src/domain/enums/StatusRastreamento.js";
import { TipoEquipamento } from "../src/domain/enums/TipoEquipamento.js";
import { ValidadorCNPJ } from "../src/domain/validators/ValidadorCNPJ.js";
import { ValidadorDataEntrada } from "../src/domain/validators/ValidadorDataEntrada.js";
import { ValidadorEstadoFisico } from "../src/domain/validators/ValidadorEstadoFisico.js";
import { ControlePermissoes } from "../src/security/ControlePermissoes.js";
import { Credencial } from "../src/security/Credencial.js";
import { Permissao } from "../src/security/Permissao.js";
import { ServicoAutenticacao } from "../src/security/ServicoAutenticacao.js";
import { DURACAO_SESSAO_MS } from "../src/security/Sessao.js";

function criarDiretorioTemporario(prefixo: string): string {
  return mkdtempSync(join(tmpdir(), prefixo));
}

test("valida CNPJ, data de entrada e queda de estado", () => {
  const cnpj = new ValidadorCNPJ();
  assert.equal(cnpj.validar("04.252.011/0001-10"), true);
  assert.equal(cnpj.validar("04.252.011/0001-11"), false);

  const data = new ValidadorDataEntrada();
  assert.equal(data.validar(new Date(Date.now() + 86_400_000)), false);
  const antiga = new Date();
  antiga.setDate(antiga.getDate() - 91);
  assert.equal(data.validar(antiga), false);

  const estado = new ValidadorEstadoFisico();
  assert.equal(
    estado.validar({
      estadoAnterior: EstadoFisico.BOM_ESTADO,
      novoEstado: EstadoFisico.USADO_MODERADO,
    }),
    false,
  );
  assert.equal(
    estado.validar({
      estadoAnterior: EstadoFisico.BOM_ESTADO,
      novoEstado: EstadoFisico.USADO_MODERADO,
      justificativa: "desgaste identificado",
    }),
    true,
  );
});

test("cifra dados, persiste entidades e remove temporario orfao", () => {
  const base = criarDiretorioTemporario("greencode-persistencia-");
  try {
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const repositorio = new RepositorioArquivo(base, criptografia, chave);
    repositorio.salvarEntidade("dados.json", { id: "1", valor: "segredo" });
    writeFileSync(join(base, "dados.json.tmp-orfa"), "temporario");
    repositorio.limparTemporariosOrfaos("dados.json");
    assert.equal(readdirSync(base).some((arquivo) => arquivo.includes(".tmp-")), false);

    const arquivo = readFileSync(join(base, "dados.json"), "utf8");
    assert.equal(arquivo.includes("segredo"), false);
    assert.deepEqual(repositorio.carregarEntidade("dados.json", "1"), {
      id: "1",
      valor: "segredo",
    });

    repositorio.salvarEntidade("dados.json", { id: "1", valor: "atualizado" });
    assert.equal(repositorio.listarEntidades("dados.json").length, 1);
    repositorio.excluirEntidade("dados.json", "1");
    assert.deepEqual(repositorio.listarEntidades("dados.json"), []);
    class CriptografiaComFalha extends CriptografiaArquivo {
      public override cifrar(dados: string, chave: string): string {
        mkdirSync(join(base, "falha.json"));
        return super.cifrar(dados, chave);
      }
    }

    const repositorioComFalha = new RepositorioArquivo(
      base,
      new CriptografiaComFalha(),
      chave,
    );
    assert.throws(() =>
      repositorioComFalha.salvarEntidade("falha.json", {
        id: "falha",
        valor: "teste",
      }),
    );
    assert.equal(readdirSync(base).some((arquivo) => arquivo.includes("tmp-")), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("mantem autocomplete, historico persistente e encerra o loop da CLI", () => {
  const base = criarDiretorioTemporario("greencode-cli-infra-");
  try {
    const cli = Object.create(CLIInterface.prototype) as CLIInterface;
    const cliInterna = cli as unknown as {
      caminhoHistorico: string;
      interfaceLinha: { close: () => void } | null;
      completar: (linha: string) => [string[], string];
      salvarHistorico: (historico: string[]) => void;
      carregarHistorico: () => string[];
      encerrarLoop: () => void;
    };
    cliInterna.caminhoHistorico = join(base, "historico.txt");
    const autocomplete = cliInterna.completar("equip");
    assert.deepEqual(autocomplete[0], ["equipamento"]);

    cliInterna.salvarHistorico([
      "login admin senha",
      "usuario criar --usuario operador --senha secreta --papel AUDITOR",
      "menu",
    ]);
    assert.deepEqual(cliInterna.carregarHistorico(), ["menu"]);

    let fechado = false;
    cliInterna.interfaceLinha = { close: () => { fechado = true; } };
    cliInterna.encerrarLoop();
    assert.equal(fechado, true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("bloqueia CNPJ duplicado e data de lote invalida no servico", () => {
  const base = criarDiretorioTemporario("greencode-validacao-servico-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(base, criptografia, criptografia.gerarChave());
    const controle = new ControlePermissoes();
    const organizacao = new ServicoOrganizacao(
      repositorio,
      new ValidadorCNPJ(),
      controle,
      PapelUsuario.OPERADOR_CADASTRO,
    );
    const dados = {
      id: "org-1",
      razaoSocial: "Empresa",
      cnpj: "04.252.011/0001-10",
      inscricaoEstadual: "123",
      enderecoCompleto: "Rua",
      telefone: "111",
      email: "empresa@teste.com",
      dataCadastro: new Date(),
      ativo: true,
      contratoVigente: false,
    };
    assert.throws(() =>
      organizacao.cadastrarOrganizacao({
        ...dados,
        id: "org-cnpj-invalido",
        cnpj: "04.252.011/0001-11",
      }),
    );
    organizacao.cadastrarOrganizacao(dados);
    assert.throws(() => organizacao.cadastrarOrganizacao({ ...dados, id: "org-2" }));
    assert.throws(
      () =>
        organizacao.cadastrarOrganizacao({
          ...dados,
          id: "org-3",
          cnpj: "04252011000110",
        }),
      /CNPJ ja cadastrado/,
    );

    const lote = new ServicoLote(
      repositorio,
      new ValidadorDataEntrada(),
      controle,
      PapelUsuario.GESTOR_ALMOXARIFADO,
    );
    const dataFutura = new Date(Date.now() + 86_400_000);
    assert.throws(() => lote.criarLote({
      id: "lote-1",
      dataEntrada: dataFutura,
      organizacaoId: "org-1",
      notaFiscal: "NF",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    }));
    const dataAntiga = new Date();
    dataAntiga.setDate(dataAntiga.getDate() - 91);
    assert.throws(() => lote.criarLote({
      id: "lote-antigo",
      dataEntrada: dataAntiga,
      organizacaoId: "org-1",
      notaFiscal: "NF-ANTIGA",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    }));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("cria contrato pela CLI e atualiza a vigencia da organizacao", () => {
  const base = criarDiretorioTemporario("greencode-criar-contrato-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(
      base,
      criptografia,
      criptografia.gerarChave(),
    );
    const controle = new ControlePermissoes();
    const organizacao = new ServicoOrganizacao(
      repositorio,
      new ValidadorCNPJ(),
      controle,
      PapelUsuario.OPERADOR_CADASTRO,
    );
    organizacao.cadastrarOrganizacao({
      id: "org-contrato",
      razaoSocial: "Empresa",
      cnpj: "04.252.011/0001-10",
      inscricaoEstadual: "123",
      enderecoCompleto: "Rua",
      telefone: "111",
      email: "empresa@teste.com",
      dataCadastro: new Date(),
      ativo: true,
      contratoVigente: false,
    });

    const cli = Object.create(CLIInterface.prototype) as CLIInterface;
    const sessao = {
      token: "token-operador",
      usuario: "operador",
      papel: PapelUsuario.OPERADOR_CADASTRO,
    } as Sessao;
    const autenticacao = new ServicoAutenticacao();
    autenticacao.validarToken = () => true;
    const cliInterna = cli as unknown as {
      autenticacao: ServicoAutenticacao;
      organizacao: ServicoOrganizacao;
      sessaoAtual: Sessao;
    };
    cliInterna.autenticacao = autenticacao;
    cliInterna.organizacao = organizacao;
    cliInterna.sessaoAtual = sessao;

    cli.processarComando(
      "contrato criar --org org-contrato --dataAssinatura 2026-10-20 --dataVencimento 2027-10-20 --clausulas coleta e destinacao adequada --valorMensal 1200 --renovacaoAutomatica true",
    );

    const contratos = repositorio.listarEntidades("contratos.json");
    assert.equal(contratos.length, 1);
    assert.equal(
      contratos[0]?.clausulas,
      "coleta e destinacao adequada",
    );
    assert.equal(contratos[0]?.renovacaoAutomatica, true);
    assert.equal(
      organizacao.buscarOrganizacao("org-contrato").contratoVigente,
      true,
    );
    assert.throws(() =>
      organizacao.criarContrato({
        organizacaoId: "org-contrato",
        dataAssinatura: new Date("2026-10-20"),
        dataVencimento: new Date("2027-10-20"),
        clausulas: "outras clausulas",
        valorMensal: 1000,
        renovacaoAutomatica: false,
      }),
    );
    organizacao.definirPapel(PapelUsuario.GESTOR_ALMOXARIFADO);
    assert.throws(() =>
      organizacao.criarContrato({
        organizacaoId: "org-contrato-2",
        dataAssinatura: new Date(),
        dataVencimento: new Date(Date.now() + 86_400_000),
        clausulas: "clausula",
        valorMensal: 100,
        renovacaoAutomatica: false,
      }),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("configura parametros globais cifrados e aplica coeficiente de depreciacao", () => {
  const base = criarDiretorioTemporario("greencode-parametros-globais-");
  try {
    const criptografia = new CriptografiaArquivo();
    const provisionamento = new Provisionamento(
      base,
      criptografia,
      (usuario, senha) =>
        Credencial.criar(usuario, senha).paraPersistencia() as unknown as Record<
          string,
          unknown
        > & { id: string },
    );
    provisionamento.provisionar("admin", () => "senha-admin");
    const aplicacao = criarAplicacao(base);
    const sessao = aplicacao.autenticacao.login("admin", "senha-admin");
    aplicacao.cli.sessaoAtual = sessao;
    aplicacao.cli.processarComando(
      "parametro configurar-aliquota --imposto ICMS --valor 0.18",
    );
    aplicacao.cli.processarComando(
      "parametro configurar-depreciacao --coeficiente 0.1",
    );

    const anoFabricacao = new Date().getFullYear() - 2;
    aplicacao.repositorio.salvarEntidade("equipamentos.json", {
      id: "eq-depreciacao",
      codigoBarrasInterno: "CB-1",
      tipo: TipoEquipamento.NOTEBOOK,
      marca: "Marca",
      modelo: "Modelo",
      anoFabricacao,
      estadoFisico: EstadoFisico.NOVO,
      pesoQuilogramas: 10,
      loteId: "lote-1",
      posicaoNoLote: 1,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
    });
    assert.equal(
      aplicacao.cli.equipamento.calcularDepreciacao("eq-depreciacao"),
      2,
    );
    assert.equal(
      readFileSync(
        join(base, "dados", "parametros-globais.json"),
        "utf8",
      ).includes("ICMS"),
      false,
    );

    const novaAplicacao = criarAplicacao(base);
    const parametros = novaAplicacao.parametrosGlobais.listar();
    assert.equal(parametros.aliquotasImpostos.ICMS, 0.18);
    assert.equal(parametros.coeficienteDepreciacao, 0.1);
    assert.throws(() =>
      novaAplicacao.parametrosGlobais.configurarAliquotaImposto("ISS", 1.1),
    );
    assert.throws(() =>
      novaAplicacao.parametrosGlobais.configurarCoeficienteDepreciacao(-0.1),
    );

    novaAplicacao.parametrosGlobais.definirPapel(PapelUsuario.AUDITOR);
    assert.throws(() =>
      novaAplicacao.parametrosGlobais.configurarAliquotaImposto("ISS", 0.05),
    );
    assert.throws(() => novaAplicacao.parametrosGlobais.listar());
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("desativa organizacao e exclui somente lote vazio", () => {
  const base = criarDiretorioTemporario("greencode-exclusao-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(base, criptografia, criptografia.gerarChave());
    const controle = new ControlePermissoes();
    const organizacaoServico = new ServicoOrganizacao(
      repositorio,
      new ValidadorCNPJ(),
      controle,
      PapelUsuario.ADMINISTRADOR,
    );
    organizacaoServico.cadastrarOrganizacao({
      id: "org-1",
      razaoSocial: "Empresa",
      cnpj: "04.252.011/0001-10",
      inscricaoEstadual: "123",
      enderecoCompleto: "Rua",
      telefone: "111",
      email: "empresa@teste.com",
      dataCadastro: new Date(),
      ativo: true,
      contratoVigente: false,
    });
    organizacaoServico.desativarOrganizacao("org-1");
    assert.equal(organizacaoServico.buscarOrganizacao("org-1").ativo, false);

    const loteServico = new ServicoLote(
      repositorio,
      new ValidadorDataEntrada(),
      controle,
      PapelUsuario.ADMINISTRADOR,
    );
    loteServico.criarLote({
      id: "lote-vazio",
      dataEntrada: new Date(),
      organizacaoId: "org-1",
      notaFiscal: "NF",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    });
    loteServico.excluirLote("lote-vazio");
    assert.equal(repositorio.carregarEntidade("lotes.json", "lote-vazio"), undefined);

    const equipamento = new Equipamento({
      id: "eq-1",
      codigoBarrasInterno: "CB-1",
      tipo: TipoEquipamento.NOTEBOOK,
      marca: "Marca",
      modelo: "Modelo",
      anoFabricacao: 2020,
      estadoFisico: EstadoFisico.NOVO,
      pesoQuilogramas: 2,
      loteId: "lote-com-equipamento",
      posicaoNoLote: 0,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
    });
    loteServico.criarLote({
      id: "lote-com-equipamento",
      dataEntrada: new Date(),
      organizacaoId: "org-1",
      notaFiscal: "NF-2",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    });
    loteServico.adicionarEquipamentoLote("lote-com-equipamento", equipamento);
    assert.throws(() => loteServico.excluirLote("lote-com-equipamento"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("apaga organizacao somente desativada e sem lotes vinculados", () => {
  const base = criarDiretorioTemporario("greencode-organizacao-apagar-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(base, criptografia, criptografia.gerarChave());
    const controle = new ControlePermissoes();
    const organizacao = new ServicoOrganizacao(
      repositorio,
      new ValidadorCNPJ(),
      controle,
      PapelUsuario.ADMINISTRADOR,
    );
    const dados = {
      id: "org-1",
      razaoSocial: "Empresa",
      cnpj: "04.252.011/0001-10",
      inscricaoEstadual: "123",
      enderecoCompleto: "Rua",
      telefone: "111",
      email: "empresa@teste.com",
      dataCadastro: new Date(),
      ativo: true,
      contratoVigente: false,
    };
    organizacao.cadastrarOrganizacao(dados);
    assert.throws(() => organizacao.apagarOrganizacao("org-1"));
    organizacao.desativarOrganizacao("org-1");
    organizacao.apagarOrganizacao("org-1");
    assert.equal(repositorio.carregarEntidade("organizacoes.json", "org-1"), undefined);

    organizacao.cadastrarOrganizacao({ ...dados, id: "org-2", cnpj: "60.409.075/0001-52" });
    const lote = new ServicoLote(
      repositorio,
      new ValidadorDataEntrada(),
      controle,
      PapelUsuario.ADMINISTRADOR,
    );
    lote.criarLote({
      id: "lote-1",
      dataEntrada: new Date(),
      organizacaoId: "org-2",
      notaFiscal: "NF",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    });
    organizacao.desativarOrganizacao("org-2");
    assert.throws(() => organizacao.apagarOrganizacao("org-2"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("desvincula e apaga equipamento somente na ordem correta", () => {
  const base = criarDiretorioTemporario("greencode-equipamento-exclusao-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(base, criptografia, criptografia.gerarChave());
    const controle = new ControlePermissoes();
    const loteServico = new ServicoLote(
      repositorio,
      new ValidadorDataEntrada(),
      controle,
      PapelUsuario.ADMINISTRADOR,
    );
    loteServico.criarLote({
      id: "lote-1",
      dataEntrada: new Date(),
      organizacaoId: "org-1",
      notaFiscal: "NF",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    });
    const equipamento = new Equipamento({
      id: "eq-1",
      codigoBarrasInterno: "CB-1",
      tipo: TipoEquipamento.NOTEBOOK,
      marca: "Marca",
      modelo: "Modelo",
      anoFabricacao: 2020,
      estadoFisico: EstadoFisico.NOVO,
      pesoQuilogramas: 2,
      loteId: "lote-1",
      posicaoNoLote: 0,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
    });
    loteServico.adicionarEquipamentoLote("lote-1", equipamento);
    const equipamentoServico = new ServicoEquipamento(
      repositorio,
      new ValidadorEstadoFisico(),
      controle,
      PapelUsuario.ADMINISTRADOR,
    );

    assert.throws(() => equipamentoServico.apagarEquipamento("eq-1"));
    equipamentoServico.desvincularEquipamento("eq-1");
    assert.deepEqual(repositorio.carregarEntidade("lotes.json", "lote-1")?.equipamentos, []);
    assert.equal(repositorio.carregarEntidade("equipamentos.json", "eq-1")?.loteId, "");
    equipamentoServico.apagarEquipamento("eq-1");
    assert.equal(repositorio.carregarEntidade("equipamentos.json", "eq-1"), undefined);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("executa jornada de organizacao, lote, equipamento e rastreabilidade", () => {
  const base = criarDiretorioTemporario("greencode-jornada-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(base, criptografia, criptografia.gerarChave());
    const controle = new ControlePermissoes();
    const organizacaoServico = new ServicoOrganizacao(
      repositorio,
      new ValidadorCNPJ(),
      controle,
      PapelUsuario.OPERADOR_CADASTRO,
    );
    const organizacao = organizacaoServico.cadastrarOrganizacao({
      id: "org-1",
      razaoSocial: "Empresa",
      cnpj: "04.252.011/0001-10",
      inscricaoEstadual: "123",
      enderecoCompleto: "Rua",
      telefone: "111",
      email: "empresa@teste.com",
      dataCadastro: new Date(),
      ativo: true,
      contratoVigente: false,
    });
    const loteServico = new ServicoLote(
      repositorio,
      new ValidadorDataEntrada(),
      controle,
      PapelUsuario.GESTOR_ALMOXARIFADO,
    );
    const lote = loteServico.criarLote({
      id: "lote-1",
      dataEntrada: new Date(),
      organizacaoId: organizacao.id,
      notaFiscal: "NF",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    });
    const equipamento = new Equipamento({
      id: "eq-1",
      codigoBarrasInterno: "CB-1",
      tipo: TipoEquipamento.NOTEBOOK,
      marca: "Marca",
      modelo: "Modelo",
      anoFabricacao: 2020,
      estadoFisico: EstadoFisico.NOVO,
      pesoQuilogramas: 2,
      loteId: lote.id,
      posicaoNoLote: 0,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
    });
    loteServico.adicionarEquipamentoLote(lote.id, equipamento);
    const equipamentoServico = new ServicoEquipamento(
      repositorio,
      new ValidadorEstadoFisico(),
      controle,
      PapelUsuario.GESTOR_ALMOXARIFADO,
    );
    assert.throws(() => equipamentoServico.movimentarParaDesmonte(equipamento.id, "gestor"));
    loteServico.processarTriagem(lote.id);
    assert.throws(() => loteServico.processarTriagem(lote.id), /Somente lotes recebidos/);
    equipamentoServico.movimentarParaDesmonte(equipamento.id, "gestor");
    assert.throws(() =>
      equipamentoServico.atualizarEstadoFisico(
        equipamento.id,
        EstadoFisico.INSERVIVEL,
      ),
    );
    const equipamentoPersistido = repositorio.carregarEntidade(
      "equipamentos.json",
      equipamento.id,
    );
    assert.deepEqual(
      (equipamentoPersistido?.historicoMovimentacao as Array<{
        destino: string;
        origem: string;
        responsavel: string;
      }>).map(({ origem, destino, responsavel }) => ({
        origem,
        destino,
        responsavel,
      })),
      [
        { origem: "ORIGEM", destino: "TRIAGEM", responsavel: "GESTOR_ALMOXARIFADO" },
        { origem: "TRIAGEM", destino: "DESMONTE", responsavel: "gestor" },
      ],
    );
    assert.equal(
      repositorio.carregarEntidade("equipamentos.json", equipamento.id)?.statusRastreamento,
      StatusRastreamento.EM_DESMONTE,
    );
    equipamentoServico.atualizarEstadoFisico(
      equipamento.id,
      EstadoFisico.USADO_MODERADO,
      "desgaste identificado",
    );
    const auditoria = new ServicoEquipamento(
      repositorio,
      new ValidadorEstadoFisico(),
      controle,
      PapelUsuario.AUDITOR,
    ).rastrearEquipamento(equipamento.id);
    assert.equal(auditoria.organizacao.id, organizacao.id);
    assert.equal(auditoria.lote.id, lote.id);
    assert.equal(auditoria.equipamento.estadoFisico, EstadoFisico.USADO_MODERADO);
    assert.equal(auditoria.movimentacoes.length, 2);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("executa jornada completa pela CLI e verifica movimentacoes, rastreabilidade e journal", () => {
  const base = criarDiretorioTemporario("greencode-jornada-cli-");
  try {
    const criptografia = new CriptografiaArquivo();
    const provisionamento = new Provisionamento(
      base,
      criptografia,
      (usuario, senha) =>
        Credencial.criar(usuario, senha).paraPersistencia() as unknown as Record<
          string,
          unknown
        > & { id: string },
    );
    const configuracao = provisionamento.provisionar("admin", () => "senha-admin");
    assert.equal(
      Buffer.from(configuracao.chaveCriptografia, "base64url").length,
      32,
    );

    const aplicacao = criarAplicacao(base);
    aplicacao.cli.processarComando("login admin senha-admin");
    aplicacao.cli.processarComando(
      "organizacao cadastrar --id org-cli-jornada --razaoSocial Empresa CLI --cnpj 04.252.011/0001-10 --inscricaoEstadual 123 --endereco Rua Um --telefone 111 --email cli@teste.com",
    );
    const hoje = new Date().toISOString().slice(0, 10);
    aplicacao.cli.processarComando(
      `lote criar --id lote-cli-jornada --dataEntrada ${hoje} --org org-cli-jornada --nf NF-CLI --transp TransCLI`,
    );
    aplicacao.cli.processarComando(
      "equipamento cadastrar --id eq-cli-jornada --codigo CB-CLI-1 --tipo NOTEBOOK --marca Marca --modelo Modelo --ano 2020 --peso 2 --lote lote-cli-jornada",
    );
    aplicacao.cli.processarComando("lote triar --id lote-cli-jornada");
    aplicacao.cli.processarComando(
      "equipamento desmonte --id eq-cli-jornada",
    );
    aplicacao.cli.processarComando(
      "equipamento rastrear --id eq-cli-jornada",
    );

    const historico = aplicacao.cli.equipamento.rastrearEquipamento(
      "eq-cli-jornada",
    );
    assert.equal(historico.organizacao.id, "org-cli-jornada");
    assert.equal(historico.lote.id, "lote-cli-jornada");
    assert.equal(historico.equipamento.statusRastreamento, StatusRastreamento.EM_DESMONTE);
    assert.equal(historico.movimentacoes.length, 2);
    assert.deepEqual(
      historico.movimentacoes.map(({ destino, responsavel }) => ({
        destino,
        responsavel,
      })),
      [
        { destino: "TRIAGEM", responsavel: "admin" },
        { destino: "DESMONTE", responsavel: "admin" },
      ],
    );

    const journal = new JournalTransacao(
      {
        id: "consulta",
        timestamp: new Date(),
        operacao: "CONSULTA",
        entidade: "Journal",
        dadosAntes: null,
        dadosDepois: null,
        usuarioResponsavel: "admin",
      },
      join(base, "journal"),
      criptografia,
      configuracao.chaveCriptografia,
    );
    const registros = journal.listarRegistros();
    assert.ok(
      registros.some(
        (registro) =>
          registro.operacao === "CRIAR" &&
          registro.entidade === "Organizacao",
      ),
    );
    assert.ok(registros.some((registro) => registro.entidade === "Lote"));
    assert.ok(registros.some((registro) => registro.entidade === "Equipamento"));
    assert.ok(
      registros.some((registro) => registro.operacao === "PROCESSAR_TRIAGEM"),
    );
    assert.ok(
      registros.some(
        (registro) => registro.operacao === "MOVIMENTAR_PARA_DESMONTE",
      ),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("comando CLI movimenta equipamento para desmonte pelo usuario autenticado", () => {
  const base = criarDiretorioTemporario("greencode-cli-desmonte-");
  try {
    const criptografia = new CriptografiaArquivo();
    const repositorio = new RepositorioArquivo(
      base,
      criptografia,
      criptografia.gerarChave(),
    );
    const controle = new ControlePermissoes();
    const lote = new ServicoLote(
      repositorio,
      new ValidadorDataEntrada(),
      controle,
      PapelUsuario.GESTOR_ALMOXARIFADO,
    );
    lote.criarLote({
      id: "lote-cli",
      dataEntrada: new Date(),
      organizacaoId: "org-cli",
      notaFiscal: "NF-CLI",
      transportadora: "Trans",
      statusProcessamento: "RECEBIDO" as never,
      observacoes: "",
    });
    lote.adicionarEquipamentoLote(
      "lote-cli",
      new Equipamento({
        id: "eq-cli",
        codigoBarrasInterno: "CB-CLI",
        tipo: TipoEquipamento.NOTEBOOK,
        marca: "Marca",
        modelo: "Modelo",
        anoFabricacao: 2020,
        estadoFisico: EstadoFisico.NOVO,
        pesoQuilogramas: 2,
        loteId: "lote-cli",
        posicaoNoLote: 0,
        statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
      }),
    );
    lote.processarTriagem("lote-cli", "operador-1");

    const equipamento = new ServicoEquipamento(
      repositorio,
      new ValidadorEstadoFisico(),
      controle,
      PapelUsuario.GESTOR_ALMOXARIFADO,
    );
    const autenticacao = new ServicoAutenticacao();
    autenticacao.validarToken = () => true;
    const cli = Object.create(CLIInterface.prototype) as CLIInterface;
    const cliInterna = cli as unknown as {
      autenticacao: ServicoAutenticacao;
      equipamento: ServicoEquipamento;
      sessaoAtual: Sessao;
    };
    cliInterna.autenticacao = autenticacao;
    cliInterna.equipamento = equipamento;
    cliInterna.sessaoAtual = {
      token: "token-valido",
      usuario: "gestor-1",
      papel: PapelUsuario.GESTOR_ALMOXARIFADO,
    } as Sessao;

    cli.processarComando("equipamento desmonte --id eq-cli");

    const persistido = repositorio.carregarEntidade("equipamentos.json", "eq-cli");
    assert.equal(persistido?.statusRastreamento, StatusRastreamento.EM_DESMONTE);
    const movimentacoes = persistido?.historicoMovimentacao as Array<{
      destino: string;
      responsavel: string;
    }>;
    assert.equal(movimentacoes[1]?.destino, "DESMONTE");
    assert.equal(movimentacoes[1]?.responsavel, "gestor-1");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("autentica com salt individual e expira sessao", () => {
  const primeira = Credencial.criar("admin", "senha");
  const segunda = Credencial.criar("admin-2", "senha");
  assert.notEqual(primeira.salt, segunda.salt);
  assert.notEqual(primeira.hashSenha, segunda.hashSenha);
  assert.equal(primeira.verificarSenha("senha"), true);
  assert.equal(primeira.verificarSenha("errada"), false);

  const autenticacao = new ServicoAutenticacao([primeira]);
  const sessao = autenticacao.login("admin", "senha");
  assert.equal(sessao.expiracao.getTime() - sessao.criacao.getTime(), DURACAO_SESSAO_MS);
  assert.equal(autenticacao.validarToken(sessao.token), true);
  assert.throws(() => autenticacao.login("admin", "senha-incorreta"));
  sessao.expiracao = new Date(Date.now() - 1);
  assert.equal(autenticacao.validarToken(sessao.token), false);
  assert.throws(() =>
    autenticacao.criarUsuario(
      sessao.token,
      "bloqueado",
      "senha",
      PapelUsuario.AUDITOR,
    ),
  );
});

test("normaliza espacos no nome do usuario durante o login", () => {
  const autenticacao = new ServicoAutenticacao([
    Credencial.criar(" Gerson ", "123"),
  ]);

  const sessao = autenticacao.login("Gerson", "123");
  assert.equal(sessao.usuario, "Gerson");
});

test("provisiona sistema sem configuracao e realiza primeiro login", () => {
  const base = criarDiretorioTemporario("greencode-provisionamento-teste-");
  try {
    const criptografia = new CriptografiaArquivo();
    const provisionamento = new Provisionamento(
      base,
      criptografia,
      (usuario, senha) =>
        Credencial.criar(usuario, senha).paraPersistencia() as unknown as Record<
          string,
          unknown
        > & { id: string },
    );
    const configuracao = provisionamento.provisionar("admin", () => "senha");
    assert.equal(Buffer.from(configuracao.chaveCriptografia, "base64url").length, 32);

    const aplicacao = criarAplicacao(base, PapelUsuario.ADMINISTRADOR);
    const sessao = aplicacao.autenticacao.login("admin", "senha");
    assert.equal(sessao.usuario, "admin");
    const credenciais = readFileSync(
      join(base, "dados", configuracao.arquivoCredenciais),
      "utf8",
    );
    assert.equal(credenciais.includes("senha"), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("cria usuario pela CLI, persiste credencial e exige permissao administrativa", () => {
  const base = criarDiretorioTemporario("greencode-criar-usuario-");
  try {
    const criptografia = new CriptografiaArquivo();
    const provisionamento = new Provisionamento(
      base,
      criptografia,
      (usuario, senha) =>
        Credencial.criar(usuario, senha).paraPersistencia() as unknown as Record<
          string,
          unknown
        > & { id: string },
    );
    provisionamento.provisionar("admin", () => "senha-admin");
    const aplicacao = criarAplicacao(base);
    const sessaoAdmin = aplicacao.autenticacao.login("admin", "senha-admin");
    aplicacao.cli.sessaoAtual = sessaoAdmin;
    aplicacao.cli.processarComando(
      "usuario criar --usuario operador --senha senha-operador --papel OPERADOR_CADASTRO",
    );

    const novaAplicacao = criarAplicacao(base);
    const sessaoOperador = novaAplicacao.autenticacao.login(
      "operador",
      "senha-operador",
    );
    assert.equal(sessaoOperador.papel, PapelUsuario.OPERADOR_CADASTRO);
    assert.equal(
      aplicacao.repositorio
        .listarEntidades("credenciais.json")
        .find((credencial) => credencial.usuario === "operador")
        ?.hashSenha === "senha-operador",
      false,
    );
    assert.throws(() =>
      aplicacao.autenticacao.criarUsuario(
        sessaoAdmin.token,
        "operador",
        "outra-senha",
        PapelUsuario.AUDITOR,
      ),
    );

    assert.throws(() =>
      novaAplicacao.autenticacao.criarUsuario(
        sessaoOperador.token,
        "novo-auditor",
        "senha",
        PapelUsuario.AUDITOR,
      ),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("lista, edita e exclui usuarios com protecoes de acesso", () => {
  const base = criarDiretorioTemporario("greencode-crud-usuario-");
  try {
    const criptografia = new CriptografiaArquivo();
    const provisionamento = new Provisionamento(
      base,
      criptografia,
      (usuario, senha) =>
        Credencial.criar(usuario, senha).paraPersistencia() as unknown as Record<
          string,
          unknown
        > & { id: string },
    );
    provisionamento.provisionar("admin", () => "senha-admin");
    const aplicacao = criarAplicacao(base);
    const sessaoAdmin = aplicacao.autenticacao.login("admin", "senha-admin");
    aplicacao.autenticacao.criarUsuario(
      sessaoAdmin.token,
      "operador",
      "senha-operador",
      PapelUsuario.OPERADOR_CADASTRO,
    );

    const listagem = aplicacao.autenticacao.listarUsuarios(sessaoAdmin.token);
    assert.equal(listagem.length, 2);
    assert.equal("hashSenha" in listagem[0]!, false);
    assert.equal("salt" in listagem[0]!, false);
    assert.throws(
      () => aplicacao.autenticacao.excluirUsuario(sessaoAdmin.token, "admin"),
      /propria conta/,
    );
    assert.throws(
      () =>
        aplicacao.autenticacao.editarUsuario(sessaoAdmin.token, "admin", {
          papel: PapelUsuario.AUDITOR,
        }),
      /ultimo administrador/,
    );

    aplicacao.autenticacao.editarUsuario(sessaoAdmin.token, "operador", {
      senha: "senha-nova",
      papel: PapelUsuario.AUDITOR,
    });
    const sessaoAuditor = aplicacao.autenticacao.login("operador", "senha-nova");
    assert.equal(sessaoAuditor.papel, PapelUsuario.AUDITOR);
    assert.throws(() =>
      aplicacao.autenticacao.listarUsuarios(sessaoAuditor.token),
    );
    assert.throws(() =>
      aplicacao.autenticacao.login("operador", "senha-operador"),
    );

    aplicacao.autenticacao.excluirUsuario(sessaoAdmin.token, "operador");
    assert.equal(aplicacao.autenticacao.credenciais.length, 1);
    assert.throws(() => aplicacao.autenticacao.login("operador", "senha-nova"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("aplica matriz de permissoes por papel", () => {
  const controle = new ControlePermissoes();
  assert.equal(
    controle.temPermissao(PapelUsuario.ADMINISTRADOR, Permissao.GERENCIAR_CONTAS),
    true,
  );
  assert.equal(
    controle.temPermissao(PapelUsuario.AUDITOR, Permissao.CADASTRAR_ORGANIZACAO),
    false,
  );
  assert.throws(() =>
    controle.exigirPermissao(PapelUsuario.AUDITOR, Permissao.GERENCIAR_CONTAS),
  );
  for (const permissao of Object.values(Permissao)) {
    assert.equal(
      controle.temPermissao(PapelUsuario.ADMINISTRADOR, permissao),
      true,
    );
  }
});

test("menu mostra listagem de organizacoes para operador e auditor sem duplicar", () => {
  const mensagens: string[] = [];
  const logOriginal = console.log;
  console.log = (...valores: unknown[]) => {
    mensagens.push(valores.map(String).join(" "));
  };
  try {
    const cli = Object.create(CLIInterface.prototype) as CLIInterface;
    const cliInterna = cli as unknown as {
      controlePermissoes: ControlePermissoes;
    };
    cliInterna.controlePermissoes = new ControlePermissoes();

    cli.exibirMenuPorPapel(PapelUsuario.OPERADOR_CADASTRO);
    assert.equal(mensagens.filter((mensagem) => mensagem === "- organizacao listar").length, 1);
    assert.equal(mensagens.includes("- organizacao cadastrar"), true);

    mensagens.length = 0;
    cli.exibirMenuPorPapel(PapelUsuario.AUDITOR);
    assert.equal(mensagens.filter((mensagem) => mensagem === "- organizacao listar").length, 1);
    assert.equal(mensagens.includes("- organizacao cadastrar"), false);

    mensagens.length = 0;
    cli.exibirMenuPorPapel(PapelUsuario.ADMINISTRADOR);
    assert.equal(mensagens.filter((mensagem) => mensagem === "- organizacao listar").length, 1);
  } finally {
    console.log = logOriginal;
  }
});

test("registra e rotaciona journal cifrado", () => {
  const base = criarDiretorioTemporario("greencode-journal-");
  try {
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const primeiro = new JournalTransacao(
      {
        id: "1",
        timestamp: new Date(),
        operacao: "CRIAR",
        entidade: "Equipamento",
        dadosAntes: null,
        dadosDepois: { id: "eq-1", tipo: TipoEquipamento.NOTEBOOK },
        usuarioResponsavel: "admin",
      },
      base,
      criptografia,
      chave,
      300,
    );
    primeiro.registrar();

    const segundo = new JournalTransacao(
      {
        id: "2",
        timestamp: new Date(),
        operacao: "ALTERAR",
        entidade: "Equipamento",
        dadosAntes: { estado: EstadoFisico.NOVO },
        dadosDepois: { estado: EstadoFisico.BOM_ESTADO, status: StatusRastreamento.EM_TRIAGEM },
        usuarioResponsavel: "admin",
      },
      base,
      criptografia,
      chave,
      300,
    );
    segundo.registrar();

    assert.equal(segundo.listarRegistros().length, 2);
    assert.equal(
      readdirSync(base).filter((arquivo) => arquivo.endsWith(".enc")).length,
      2,
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("remove temporario do journal e preserva o erro quando a renomeacao falha", () => {
  const base = criarDiretorioTemporario("greencode-journal-falha-");
  try {
    const arquivoAtual = join(base, "journal-atual.enc");
    const criptografia = new class extends CriptografiaArquivo {
      public override cifrar(dados: string, chave: string): string {
        if (dados.includes("registro-falha")) {
          rmSync(arquivoAtual);
          mkdirSync(arquivoAtual);
        }
        return super.cifrar(dados, chave);
      }
    }();
    const chave = criptografia.gerarChave();
    const inicial = new JournalTransacao(
      {
        id: "registro-inicial",
        timestamp: new Date(),
        operacao: "CRIAR",
        entidade: "Teste",
        dadosAntes: null,
        dadosDepois: { id: "inicial" },
        usuarioResponsavel: "admin",
      },
      base,
      criptografia,
      chave,
    );
    inicial.registrar();

    const falho = new JournalTransacao(
      {
        id: "registro-falha",
        timestamp: new Date(),
        operacao: "CRIAR",
        entidade: "Teste",
        dadosAntes: null,
        dadosDepois: { id: "falha" },
        usuarioResponsavel: "admin",
      },
      base,
      criptografia,
      chave,
    );
    assert.throws(() => falho.registrar(), (erro: unknown) => {
      assert.ok(erro instanceof Error);
      assert.ok(!(erro instanceof AggregateError));
      return true;
    });
    assert.equal(
      readdirSync(base).some((arquivo) => arquivo.includes(".tmp-")),
      false,
    );
    assert.equal(readdirSync(base).includes("journal-atual.enc"), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("remove arquivos de journal rotacionados com mais de 180 dias", () => {
  const base = criarDiretorioTemporario("greencode-journal-retencao-");
  try {
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const arquivoAntigo = join(base, "journal-antigo.enc");
    const arquivoRecente = join(base, "journal-recente.enc");
    const conteudo = criptografia.cifrar("[]", chave);
    writeFileSync(arquivoAntigo, conteudo, "utf8");
    writeFileSync(arquivoRecente, conteudo, "utf8");
    const dataAntiga = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    utimesSync(arquivoAntigo, dataAntiga, dataAntiga);

    const registro = new JournalTransacao(
      {
        id: "registro-atual",
        timestamp: new Date(),
        operacao: "CRIAR",
        entidade: "Equipamento",
        dadosAntes: null,
        dadosDepois: { id: "eq-retencao" },
        usuarioResponsavel: "admin",
      },
      base,
      criptografia,
      chave,
    );
    registro.registrar();

    const arquivos = readdirSync(base);
    assert.equal(arquivos.includes("journal-antigo.enc"), false);
    assert.equal(arquivos.includes("journal-recente.enc"), true);
    assert.equal(registro.listarRegistros().length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
