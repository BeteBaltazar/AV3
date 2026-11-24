import { DadosEquipamento, Equipamento } from "../domain/entities/Equipamento.js";
import { DadosLote, Lote } from "../domain/entities/Lote.js";
import { StatusLote } from "../domain/enums/StatusLote.js";
import { StatusRastreamento } from "../domain/enums/StatusRastreamento.js";
import { ValidadorDataEntrada } from "../domain/validators/ValidadorDataEntrada.js";
import { EntidadePersistida, RepositorioArquivo } from "../infrastructure/RepositorioArquivo.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { Permissao } from "../security/Permissao.js";
import { RegistradorJournal } from "../audit/RegistradorJournal.js";

export class ServicoLote {
  public constructor(
    private readonly repositorio: RepositorioArquivo,
    private readonly validadorDataEntrada: ValidadorDataEntrada,
    private readonly controlePermissoes: ControlePermissoes,
    private papel: PapelUsuario,
    private readonly registradorJournal?: RegistradorJournal,
  ) {}

  public definirPapel(papel: PapelUsuario): void {
    this.papel = papel;
  }

  public criarLote(dados: DadosLote): Lote {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.REGISTRAR_CHEGADA_LOTE,
    );

    if (!this.validadorDataEntrada.validar(dados.dataEntrada)) {
      throw new Error(this.validadorDataEntrada.obterMensagemErro());
    }

    const lote = new Lote(dados);
    this.salvarLote(lote);
    this.registradorJournal?.registrar({
      operacao: "CRIAR",
      entidade: "Lote",
      dadosAntes: null,
      dadosDepois: lote,
      usuarioResponsavel: this.papel,
    });
    return lote;
  }

  public adicionarEquipamentoLote(
    loteId: string,
    equipamento: Equipamento,
  ): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.REGISTRAR_CHEGADA_LOTE,
    );
    const lote = this.buscarLote(loteId);
    lote.adicionarEquipamento(equipamento);
    this.salvarLote(lote);
    this.repositorio.salvarEntidade(
      "equipamentos.json",
      equipamento as unknown as EntidadePersistida,
    );
    this.registradorJournal?.registrar({
      operacao: "ADICIONAR_EQUIPAMENTO",
      entidade: "Lote",
      dadosAntes: null,
      dadosDepois: { loteId, equipamento },
      usuarioResponsavel: this.papel,
    });
  }

  public processarTriagem(
    loteId: string,
    responsavel: string = this.papel,
  ): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.TRIAR_EQUIPAMENTO,
    );
    const lote = this.buscarLote(loteId);
    if (lote.statusProcessamento !== StatusLote.RECEBIDO) {
      throw new Error("Somente lotes recebidos podem ser triados.");
    }
    const statusAnterior = lote.statusProcessamento;
    lote.statusProcessamento = StatusLote.EM_TRIAGEM;
    lote.statusProcessamento = StatusLote.TRIAGEM_CONCLUIDA;
    for (const equipamento of lote.equipamentos) {
      equipamento.statusRastreamento = StatusRastreamento.AGUARDANDO_DESMONTE;
      equipamento.registrarMovimentacao("TRIAGEM", responsavel);
      this.repositorio.salvarEntidade(
        "equipamentos.json",
        equipamento as unknown as EntidadePersistida,
      );
    }
    this.salvarLote(lote);
    this.registradorJournal?.registrar({
      operacao: "PROCESSAR_TRIAGEM",
      entidade: "Lote",
      dadosAntes: { id: lote.id, status: statusAnterior },
      dadosDepois: lote,
      usuarioResponsavel: this.papel,
    });
  }

  public consultarLotePorPeriodo(dataInicio: Date, dataFim: Date): Lote[] {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.CONSULTAR_HISTORICOS,
    );

    return this.repositorio
      .listarEntidades("lotes.json")
      .map((dados) => new Lote(dados as unknown as DadosLote))
      .filter(
        (lote) =>
          lote.dataEntrada >= dataInicio && lote.dataEntrada <= dataFim,
      );
  }

  public excluirLote(loteId: string): void {
    this.controlePermissoes.exigirPermissao(this.papel, Permissao.EXCLUIR_LOTE);
    const lote = this.buscarLote(loteId);

    if (lote.equipamentos.length > 0) {
      throw new Error("Nao e possivel excluir lote com equipamentos vinculados.");
    }

    this.repositorio.excluirEntidade("lotes.json", loteId);
    this.registradorJournal?.registrar({
      operacao: "EXCLUIR",
      entidade: "Lote",
      dadosAntes: lote,
      dadosDepois: null,
      usuarioResponsavel: this.papel,
    });
  }

  private buscarLote(id: string): Lote {
    const dados = this.repositorio.carregarEntidade("lotes.json", id);

    if (!dados) {
      throw new Error(`Lote nao encontrado: ${id}`);
    }

    const equipamentos = this.repositorio
      .listarEntidades("equipamentos.json")
      .filter((equipamento) => equipamento.loteId === id)
      .map((equipamento) => new Equipamento(equipamento as unknown as DadosEquipamento));

    return new Lote({
      ...(dados as unknown as DadosLote),
      equipamentos,
    });
  }

  private salvarLote(lote: Lote): void {
    this.repositorio.salvarEntidade(
      "lotes.json",
      lote as unknown as EntidadePersistida,
    );
  }
}
