import { StatusLote } from "../enums/StatusLote.js";
import { Equipamento } from "./Equipamento.js";

export interface DadosLote {
  id: string;
  dataEntrada: Date;
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  equipamentos?: Equipamento[];
  statusProcessamento: StatusLote;
  observacoes: string;
}

export class Lote {
  public id: string;
  public dataEntrada: Date;
  public organizacaoId: string;
  public notaFiscal: string;
  public transportadora: string;
  public equipamentos: Equipamento[];
  public statusProcessamento: StatusLote;
  public observacoes: string;

  public constructor(dados: DadosLote) {
    this.id = dados.id;
    this.dataEntrada = new Date(dados.dataEntrada);
    this.organizacaoId = dados.organizacaoId;
    this.notaFiscal = dados.notaFiscal;
    this.transportadora = dados.transportadora;
    this.equipamentos = [...(dados.equipamentos ?? [])];
    this.statusProcessamento = dados.statusProcessamento;
    this.observacoes = dados.observacoes;
  }

  public adicionarEquipamento(equipamento: Equipamento): void {
    equipamento.loteId = this.id;
    equipamento.posicaoNoLote = this.equipamentos.length + 1;
    this.equipamentos.push(equipamento);
  }

  public removerEquipamento(equipamentoId: string): boolean {
    const indice = this.equipamentos.findIndex(({ id }) => id === equipamentoId);

    if (indice < 0) {
      return false;
    }

    this.equipamentos.splice(indice, 1);
    this.equipamentos.forEach((equipamento, posicao) => {
      equipamento.posicaoNoLote = posicao + 1;
    });
    return true;
  }

  public calcularPesoTotal(): number {
    return this.equipamentos.reduce(
      (pesoTotal, equipamento) => pesoTotal + equipamento.pesoQuilogramas,
      0,
    );
  }

  public gerarRelatorioTriagem(): string {
    const linhas = this.equipamentos.map(
      (equipamento) =>
        `${equipamento.id};${equipamento.tipo};${equipamento.estadoFisico};${equipamento.statusRastreamento}`,
    );

    return [
      `Lote: ${this.id}`,
      `Status: ${this.statusProcessamento}`,
      `Equipamentos: ${this.equipamentos.length}`,
      ...linhas,
    ].join("\n");
  }
}
