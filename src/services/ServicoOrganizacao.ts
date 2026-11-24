import { randomUUID } from "node:crypto";
import {
  Contrato,
  DadosContrato,
} from "../domain/entities/Contrato.js";
import {
  DadosOrganizacao,
  Organizacao,
} from "../domain/entities/Organizacao.js";
import { ValidadorCNPJ } from "../domain/validators/ValidadorCNPJ.js";
import { EntidadePersistida, RepositorioArquivo } from "../infrastructure/RepositorioArquivo.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { Permissao } from "../security/Permissao.js";
import { RegistradorJournal } from "../audit/RegistradorJournal.js";

export class ServicoOrganizacao {
  public constructor(
    private readonly repositorio: RepositorioArquivo,
    private readonly validadorCNPJ: ValidadorCNPJ,
    private readonly controlePermissoes: ControlePermissoes,
    private papel: PapelUsuario,
    private readonly registradorJournal?: RegistradorJournal,
  ) {}

  public definirPapel(papel: PapelUsuario): void {
    this.papel = papel;
  }

  public cadastrarOrganizacao(dados: DadosOrganizacao): Organizacao {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.CADASTRAR_ORGANIZACAO,
    );

    if (!this.validadorCNPJ.validar(dados.cnpj)) {
      throw new Error(this.validadorCNPJ.obterMensagemErro());
    }

    const duplicada = this.repositorio
      .listarEntidades("organizacoes.json")
      .some(
        (organizacao) =>
          typeof organizacao.cnpj === "string" &&
          organizacao.cnpj.replace(/\D/g, "") === dados.cnpj.replace(/\D/g, ""),
      );

    if (duplicada) {
      throw new Error("CNPJ ja cadastrado para outra organizacao.");
    }

    const organizacao = new Organizacao({
      ...dados,
      id: dados.id || randomUUID(),
    });
    this.salvarOrganizacao(organizacao);
    this.registradorJournal?.registrar({
      operacao: "CRIAR",
      entidade: "Organizacao",
      dadosAntes: null,
      dadosDepois: organizacao,
      usuarioResponsavel: this.papel,
    });
    return organizacao;
  }

  public buscarOrganizacao(id: string): Organizacao {
    this.exigirConsulta();
    const dados = this.repositorio.carregarEntidade("organizacoes.json", id);

    if (!dados) {
      throw new Error(`Organizacao nao encontrada: ${id}`);
    }

    return new Organizacao(dados as unknown as DadosOrganizacao);
  }

  public listarOrganizacoesAtivas(): Organizacao[] {
    this.exigirConsulta();
    return this.repositorio
      .listarEntidades("organizacoes.json")
      .map((dados) => new Organizacao(dados as unknown as DadosOrganizacao))
      .filter((organizacao) => organizacao.ativo);
  }

  public desativarOrganizacao(organizacaoId: string): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.DESATIVAR_ORGANIZACAO,
    );
    const organizacao = this.buscarOrganizacao(organizacaoId);
    const dadosAntes = { ...organizacao };
    organizacao.desativar();
    this.salvarOrganizacao(organizacao);
    this.registradorJournal?.registrar({
      operacao: "DESATIVAR",
      entidade: "Organizacao",
      dadosAntes,
      dadosDepois: organizacao,
      usuarioResponsavel: this.papel,
    });
  }

  public apagarOrganizacao(organizacaoId: string): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.APAGAR_ORGANIZACAO,
    );
    const organizacao = this.buscarOrganizacao(organizacaoId);

    if (organizacao.ativo) {
      throw new Error("Desative a organizacao antes de apaga-la.");
    }

    const lotesVinculados = this.repositorio
      .listarEntidades("lotes.json")
      .some((lote) => lote.organizacaoId === organizacaoId);

    if (lotesVinculados) {
      throw new Error("Nao e possivel apagar organizacao com lotes vinculados.");
    }

    this.repositorio.excluirEntidade("organizacoes.json", organizacaoId);
    this.registradorJournal?.registrar({
      operacao: "APAGAR",
      entidade: "Organizacao",
      dadosAntes: organizacao,
      dadosDepois: null,
      usuarioResponsavel: this.papel,
    });
  }

  public criarContrato(
    dados: Omit<DadosContrato, "id"> & { id?: string },
  ): Contrato {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.GERENCIAR_CONTRATOS,
    );

    const organizacaoDados = this.repositorio.carregarEntidade(
      "organizacoes.json",
      dados.organizacaoId,
    );
    if (!organizacaoDados) {
      throw new Error(`Organizacao nao encontrada: ${dados.organizacaoId}`);
    }

    const dataAssinatura = new Date(dados.dataAssinatura);
    const dataVencimento = new Date(dados.dataVencimento);
    if (
      Number.isNaN(dataAssinatura.getTime()) ||
      Number.isNaN(dataVencimento.getTime()) ||
      dataVencimento < dataAssinatura
    ) {
      throw new Error("Datas do contrato invalidas: vencimento anterior a assinatura.");
    }
    if (!Number.isFinite(dados.valorMensal) || dados.valorMensal < 0) {
      throw new Error("Valor mensal do contrato deve ser um numero nao negativo.");
    }
    if (!dados.clausulas.trim()) {
      throw new Error("As clausulas do contrato sao obrigatorias.");
    }

    const contratos = this.repositorio.listarEntidades("contratos.json");
    const contratoExistente = contratos.some(
      (contrato) => contrato.organizacaoId === dados.organizacaoId,
    );
    if (contratoExistente) {
      throw new Error(
        "Organizacao ja possui contrato cadastrado. Use a renovacao de contrato.",
      );
    }

    const id = dados.id?.trim() || randomUUID();
    if (contratos.some((contrato) => contrato.id === id)) {
      throw new Error(`Contrato ja cadastrado: ${id}`);
    }

    const contrato = new Contrato({
      ...dados,
      id,
      dataAssinatura,
      dataVencimento,
    });
    const organizacao = new Organizacao(
      organizacaoDados as unknown as DadosOrganizacao,
    );
    organizacao.contratoVigente = contrato.estaVigente();

    this.repositorio.salvarEntidade(
      "contratos.json",
      contrato as unknown as EntidadePersistida,
    );
    this.salvarOrganizacao(organizacao);
    this.registradorJournal?.registrar({
      operacao: "CRIAR",
      entidade: "Contrato",
      dadosAntes: null,
      dadosDepois: contrato,
      usuarioResponsavel: this.papel,
    });
    return contrato;
  }

  public renovarContrato(organizacaoId: string, novoVencimento: Date): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.GERENCIAR_CONTRATOS,
    );
    const contratoDados = this.repositorio
      .listarEntidades("contratos.json")
      .find((contrato) => contrato.organizacaoId === organizacaoId);

    if (!contratoDados) {
      throw new Error(`Contrato nao encontrado para organizacao: ${organizacaoId}`);
    }

    const contrato = new Contrato(contratoDados as unknown as DadosContrato);
    contrato.renovar(novoVencimento);
    this.repositorio.salvarEntidade(
      "contratos.json",
      contrato as unknown as EntidadePersistida,
    );

    const organizacao = this.buscarOrganizacao(organizacaoId);
    organizacao.contratoVigente = contrato.estaVigente();
    this.salvarOrganizacao(organizacao);
    this.registradorJournal?.registrar({
      operacao: "RENOVAR_CONTRATO",
      entidade: "Contrato",
      dadosAntes: contratoDados,
      dadosDepois: contrato,
      usuarioResponsavel: this.papel,
    });
  }

  private exigirConsulta(): void {
    if (
      !this.controlePermissoes.temPermissao(
        this.papel,
        Permissao.CONSULTAR_HISTORICOS,
      ) &&
      !this.controlePermissoes.temPermissao(
        this.papel,
        Permissao.CADASTRAR_ORGANIZACAO,
      )
    ) {
      throw new Error(`Papel ${this.papel} nao possui permissao de consulta.`);
    }
  }

  private salvarOrganizacao(organizacao: Organizacao): void {
    this.repositorio.salvarEntidade(
      "organizacoes.json",
      organizacao as unknown as EntidadePersistida,
    );
  }
}
