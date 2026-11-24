import { EstadoFisico } from "../enums/EstadoFisico.js";
import { StatusRastreamento } from "../enums/StatusRastreamento.js";
import { TipoEquipamento } from "../enums/TipoEquipamento.js";
import { Movimentacao } from "./Movimentacao.js";

export interface DadosEquipamento {
  id: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  loteId: string;
  posicaoNoLote: number;
  statusRastreamento: StatusRastreamento;
  historicoMovimentacao?: Movimentacao[];
}

export class Equipamento {
  public id: string;
  public codigoBarrasInterno: string;
  public tipo: TipoEquipamento;
  public marca: string;
  public modelo: string;
  public anoFabricacao: number;
  public estadoFisico: EstadoFisico;
  public pesoQuilogramas: number;
  public loteId: string;
  public posicaoNoLote: number;
  public statusRastreamento: StatusRastreamento;
  public historicoMovimentacao: Movimentacao[];

  public constructor(dados: DadosEquipamento) {
    this.id = dados.id;
    this.codigoBarrasInterno = dados.codigoBarrasInterno;
    this.tipo = dados.tipo;
    this.marca = dados.marca;
    this.modelo = dados.modelo;
    this.anoFabricacao = dados.anoFabricacao;
    this.estadoFisico = dados.estadoFisico;
    this.pesoQuilogramas = dados.pesoQuilogramas;
    this.loteId = dados.loteId;
    this.posicaoNoLote = dados.posicaoNoLote;
    this.statusRastreamento = dados.statusRastreamento;
    this.historicoMovimentacao = (dados.historicoMovimentacao ?? []).map(
      (movimentacao) =>
        new Movimentacao(
          movimentacao.id,
          movimentacao.equipamentoId,
          new Date(movimentacao.dataHora),
          movimentacao.origem,
          movimentacao.destino,
          movimentacao.responsavel,
          movimentacao.observacao,
        ),
    );
  }

  public atualizarStatus(novoStatus: StatusRastreamento, _justificativa: string): void {
    this.statusRastreamento = novoStatus;
  }

  public registrarMovimentacao(destino: string, responsavel: string): void {
    const origem = this.historicoMovimentacao.at(-1)?.destino ?? "ORIGEM";
    const movimentacao = new Movimentacao(
      `${this.id}-${this.historicoMovimentacao.length + 1}`,
      this.id,
      new Date(),
      origem,
      destino,
      responsavel,
      "",
    );

    this.historicoMovimentacao.push(movimentacao);
  }

  public calcularDepreciacao(coeficienteDepreciacao = 0.08): number {
    if (
      !Number.isFinite(coeficienteDepreciacao) ||
      coeficienteDepreciacao < 0 ||
      coeficienteDepreciacao > 1
    ) {
      throw new Error("Coeficiente de depreciacao deve estar entre 0 e 1.");
    }
    const anos = Math.max(0, new Date().getFullYear() - this.anoFabricacao);
    const valor = this.pesoQuilogramas * anos * coeficienteDepreciacao;

    return Number(valor.toFixed(2));
  }
}
