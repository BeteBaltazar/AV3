import { EstadoFisico } from "../enums/EstadoFisico.js";
import { calcularQuedaEstadoFisico } from "../enums/EstadoFisicoOrdem.js";
import { Validador } from "./Validador.js";

export interface DadosAlteracaoEstadoFisico {
  estadoAnterior: EstadoFisico;
  novoEstado: EstadoFisico;
  justificativa?: string;
}

export class ValidadorEstadoFisico extends Validador {
  public override validar(dados: unknown): boolean {
    this.limparErro();

    if (!this.ehDadosAlteracao(dados)) {
      return this.definirErro("Dados de alteracao de estado fisico invalidos.");
    }

    const queda = calcularQuedaEstadoFisico(
      dados.estadoAnterior,
      dados.novoEstado,
    );

    if (queda >= 2 && !dados.justificativa?.trim()) {
      return this.definirErro(
        "Queda de duas ou mais categorias exige justificativa.",
      );
    }

    return true;
  }

  private ehDadosAlteracao(
    dados: unknown,
  ): dados is DadosAlteracaoEstadoFisico {
    if (typeof dados !== "object" || dados === null) {
      return false;
    }

    const candidato = dados as Partial<DadosAlteracaoEstadoFisico>;
    return (
      Object.values(EstadoFisico).includes(candidato.estadoAnterior as EstadoFisico) &&
      Object.values(EstadoFisico).includes(candidato.novoEstado as EstadoFisico)
    );
  }
}
