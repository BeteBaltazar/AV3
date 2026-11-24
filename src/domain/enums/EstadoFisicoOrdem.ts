import { EstadoFisico } from "./EstadoFisico.js";

const ordemEstadosFisicos = Object.values(EstadoFisico);

export function obterPosicaoEstadoFisico(estado: EstadoFisico): number {
  const posicao = ordemEstadosFisicos.indexOf(estado);

  if (posicao < 0) {
    throw new Error(`Estado fisico desconhecido: ${estado}`);
  }

  return posicao;
}

export function calcularQuedaEstadoFisico(
  estadoAnterior: EstadoFisico,
  novoEstado: EstadoFisico,
): number {
  return Math.max(
    0,
    obterPosicaoEstadoFisico(novoEstado) -
      obterPosicaoEstadoFisico(estadoAnterior),
  );
}
