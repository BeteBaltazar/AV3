import { DadosEquipamento, Equipamento } from "../domain/entities/Equipamento.js";
import { Lote } from "../domain/entities/Lote.js";
import { Movimentacao } from "../domain/entities/Movimentacao.js";
import { Organizacao } from "../domain/entities/Organizacao.js";
import { EstadoFisico } from "../domain/enums/EstadoFisico.js";
import { StatusRastreamento } from "../domain/enums/StatusRastreamento.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { ValidadorEstadoFisico } from "../domain/validators/ValidadorEstadoFisico.js";
import { EntidadePersistida, RepositorioArquivo } from "../infrastructure/RepositorioArquivo.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { Permissao } from "../security/Permissao.js";
import { HistoricoCompleto } from "./HistoricoCompleto.js";
import { TipoEquipamento } from "../domain/enums/TipoEquipamento.js";
import { RegistradorJournal } from "../audit/RegistradorJournal.js";
import {
  COEFICIENTE_DEPRECIACAO_PADRAO,
  ServicoParametrosGlobais,
} from "./ServicoParametrosGlobais.js";

export class ServicoEquipamento {
  public constructor(
    private readonly repositorio: RepositorioArquivo,
    private readonly validadorEstadoFisico: ValidadorEstadoFisico,
    private readonly controlePermissoes: ControlePermissoes,
    private papel: PapelUsuario,
    private readonly registradorJournal?: RegistradorJournal,
    private readonly parametrosGlobais?: ServicoParametrosGlobais,
  ) {}

  public definirPapel(papel: PapelUsuario): void {
    this.papel = papel;
  }

  public rastrearEquipamento(id: string): HistoricoCompleto {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.CONSULTAR_HISTORICOS,
    );
    const equipamentoDados = this.repositorio.carregarEntidade(
      "equipamentos.json",
      id,
    );

    if (!equipamentoDados) {
      throw new Error(`Equipamento nao encontrado: ${id}`);
    }

    const equipamento = new Equipamento(
      equipamentoDados as unknown as DadosEquipamento,
    );
    const loteDados = this.repositorio.carregarEntidade(
      "lotes.json",
      equipamento.loteId,
    );

    if (!loteDados) {
      throw new Error(`Lote nao encontrado: ${equipamento.loteId}`);
    }

    const lote = new Lote(loteDados as never);
    const organizacaoDados = this.repositorio.carregarEntidade(
      "organizacoes.json",
      lote.organizacaoId,
    );

    if (!organizacaoDados) {
      throw new Error(`Organizacao nao encontrada: ${lote.organizacaoId}`);
    }

    return {
      equipamento,
      lote,
      organizacao: new Organizacao(organizacaoDados as never),
      movimentacoes: [...equipamento.historicoMovimentacao].sort(
        (a, b) => a.dataHora.getTime() - b.dataHora.getTime(),
      ),
    };
  }

  public atualizarEstadoFisico(
    id: string,
    novoEstado: EstadoFisico,
    justificativa = "",
  ): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.TRIAR_EQUIPAMENTO,
    );
    const equipamento = this.buscarEquipamento(id);
    const valido = this.validadorEstadoFisico.validar({
      estadoAnterior: equipamento.estadoFisico,
      novoEstado,
      justificativa,
    });

    if (!valido) {
      throw new Error(this.validadorEstadoFisico.obterMensagemErro());
    }

    const estadoAnterior = equipamento.estadoFisico;
    equipamento.estadoFisico = novoEstado;
    this.salvarEquipamento(equipamento);
    this.registradorJournal?.registrar({
      operacao: "ATUALIZAR_ESTADO_FISICO",
      entidade: "Equipamento",
      dadosAntes: { id: equipamento.id, estadoFisico: estadoAnterior },
      dadosDepois: equipamento,
      usuarioResponsavel: this.papel,
    });
  }

  public gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.ALOCAR_CODIGO_BARRAS,
    );
    return `${tipo}-${String(sequencia).padStart(8, "0")}`;
  }

  public calcularDepreciacao(id: string): number {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.GERAR_RELATORIOS,
    );
    const equipamento = this.buscarEquipamento(id);
    const coeficiente =
      this.parametrosGlobais?.obterCoeficienteDepreciacao() ??
      COEFICIENTE_DEPRECIACAO_PADRAO;
    return equipamento.calcularDepreciacao(coeficiente);
  }

  public movimentarParaDesmonte(id: string, responsavel: string): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.TRIAR_EQUIPAMENTO,
    );
    const equipamento = this.buscarEquipamento(id);

    if (equipamento.statusRastreamento !== StatusRastreamento.AGUARDANDO_DESMONTE) {
      throw new Error("Equipamento precisa passar por triagem antes do desmonte.");
    }

    const dadosAntes = {
      id: equipamento.id,
      statusRastreamento: equipamento.statusRastreamento,
    };
    equipamento.atualizarStatus(StatusRastreamento.EM_DESMONTE, "");
    equipamento.registrarMovimentacao("DESMONTE", responsavel);
    this.salvarEquipamento(equipamento);
    this.registradorJournal?.registrar({
      operacao: "MOVIMENTAR_PARA_DESMONTE",
      entidade: "Equipamento",
      dadosAntes,
      dadosDepois: equipamento,
      usuarioResponsavel: responsavel,
    });
  }

  public desvincularEquipamento(id: string): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.REGISTRAR_CHEGADA_LOTE,
    );
    const equipamento = this.buscarEquipamento(id);

    if (!equipamento.loteId) {
      throw new Error("Equipamento ja esta desvinculado de um lote.");
    }

    const loteDados = this.repositorio.carregarEntidade(
      "lotes.json",
      equipamento.loteId,
    );

    if (!loteDados) {
      throw new Error(`Lote nao encontrado: ${equipamento.loteId}`);
    }

    const lote = new Lote(loteDados as never);
    if (!lote.removerEquipamento(id)) {
      throw new Error("Equipamento nao esta vinculado ao lote informado.");
    }

    const loteIdAnterior = equipamento.loteId;
    equipamento.loteId = "";
    equipamento.posicaoNoLote = 0;
    this.repositorio.salvarEntidade(
      "lotes.json",
      lote as unknown as EntidadePersistida,
    );
    this.salvarEquipamento(equipamento);
    this.registradorJournal?.registrar({
      operacao: "DESVINCULAR",
      entidade: "Equipamento",
      dadosAntes: { id, loteId: loteIdAnterior },
      dadosDepois: { id, loteId: "" },
      usuarioResponsavel: this.papel,
    });
  }

  public apagarEquipamento(id: string): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.GERENCIAR_CONTAS,
    );
    const equipamento = this.buscarEquipamento(id);

    if (equipamento.loteId) {
      throw new Error("Desvincule o equipamento do lote antes de apaga-lo.");
    }

    this.repositorio.excluirEntidade("equipamentos.json", id);
    this.registradorJournal?.registrar({
      operacao: "APAGAR",
      entidade: "Equipamento",
      dadosAntes: equipamento,
      dadosDepois: null,
      usuarioResponsavel: this.papel,
    });
  }

  private buscarEquipamento(id: string): Equipamento {
    const dados = this.repositorio.carregarEntidade("equipamentos.json", id);

    if (!dados) {
      throw new Error(`Equipamento nao encontrado: ${id}`);
    }

    return new Equipamento(dados as unknown as DadosEquipamento);
  }

  private salvarEquipamento(equipamento: Equipamento): void {
    this.repositorio.salvarEntidade(
      "equipamentos.json",
      equipamento as unknown as EntidadePersistida,
    );
  }
}
