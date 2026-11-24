import { Equipamento } from "../domain/entities/Equipamento.js";
import { Lote } from "../domain/entities/Lote.js";
import { Movimentacao } from "../domain/entities/Movimentacao.js";
import { Organizacao } from "../domain/entities/Organizacao.js";

export interface HistoricoCompleto {
  equipamento: Equipamento;
  lote: Lote;
  organizacao: Organizacao;
  movimentacoes: Movimentacao[];
}
