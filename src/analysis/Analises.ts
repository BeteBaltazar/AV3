export interface SnapshotLoteAnalitico {
  id: string;
  dataEntrada: Date;
  statusProcessamento: string;
  equipamentos: Array<{
    id: string;
    tipo: string;
    marca: string;
    modelo: string;
    anoFabricacao: number;
    estadoFisico: string;
    pesoQuilogramas: number;
    valorEstimadoRecuperacao: number | null;
    valorRecuperacaoReal: number | null;
    historicoMovimentacao: Array<{
      dataHora: Date;
      destino: string;
      responsavel: string;
    }>;
  }>;
}

export interface SnapshotEquipamentoAnalitico {
  id: string;
  tipo: string;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: string;
  pesoQuilogramas: number;
  valorEstimadoRecuperacao: number | null;
  valorRecuperacaoReal: number | null;
  historicoEstados: Array<{
    dataHora: Date;
    estadoFisico: string;
  }>;
}

export function analisarEficiencia(lotes: SnapshotLoteAnalitico[]) {
  const porLote = lotes.map((lote) => {
    const concluidas = lote.equipamentos
      .flatMap((equipamento) => equipamento.historicoMovimentacao)
      .filter((movimentacao) => movimentacao.destino === "TRIAGEM")
      .map((movimentacao) => movimentacao.dataHora);
    const conclusao = concluidas.length
      ? new Date(Math.max(...concluidas.map((data) => data.getTime())))
      : null;
    const horas = conclusao
      ? (conclusao.getTime() - lote.dataEntrada.getTime()) / 3_600_000
      : null;
    return {
      loteId: lote.id,
      entrada: lote.dataEntrada,
      conclusaoTriagem: conclusao,
      horasProcessamento: horas !== null && horas >= 0 ? horas : null,
    };
  });
  const duracoes = porLote
    .map((lote) => lote.horasProcessamento)
    .filter((valor): valor is number => valor !== null);
  const porOperador = new Map<string, number[]>();
  for (const lote of lotes) {
    for (const equipamento of lote.equipamentos) {
      for (const movimentacao of equipamento.historicoMovimentacao) {
        if (movimentacao.destino === "TRIAGEM") {
          const duracao = (movimentacao.dataHora.getTime() - lote.dataEntrada.getTime()) / 3_600_000;
          if (duracao >= 0) {
            porOperador.set(
              movimentacao.responsavel,
              [...(porOperador.get(movimentacao.responsavel) ?? []), duracao],
            );
          }
        }
      }
    }
  }
  return {
    metodo: "Diferenca entre dataEntrada do lote e movimentacoes destino TRIAGEM",
    loteCount: lotes.length,
    observacoes: [
      "A duracao de cada lote considera o horario da ultima triagem registrada.",
      "Lotes sem movimentacao de conclusao nao entram na media.",
    ],
    mediaHoras: duracoes.length ? media(duracoes) : null,
    porLote,
    porOperador: [...porOperador.entries()].map(([operador, valores]) => ({
      operador,
      quantidade: valores.length,
      mediaHoras: media(valores),
    })),
  };
}

export function analisarRentabilidade(equipamentos: SnapshotEquipamentoAnalitico[]) {
  const comValor = equipamentos
    .filter((equipamento) =>
      equipamento.valorRecuperacaoReal !== null ||
      equipamento.valorEstimadoRecuperacao !== null,
    )
    .map((equipamento) => ({
      equipamento,
      valor: equipamento.valorRecuperacaoReal ?? equipamento.valorEstimadoRecuperacao!,
      tipoValor: equipamento.valorRecuperacaoReal !== null ? "REAL" : "ESTIMADO",
    }));
  const categorias = new Map<string, Array<{ valor: number; tipoValor: string }>>();
  for (const item of comValor) {
    const chave = item.equipamento.tipo;
    categorias.set(chave, [...(categorias.get(chave) ?? []), item]);
  }
  return {
    metodo: "Media aritmetica de valor real, quando disponivel, ou valor estimado",
    equipamentoCount: equipamentos.length,
    valorDisponivelCount: comValor.length,
    observacoes: [
      "Valores nao informados nao sao inventados nem incluidos no calculo.",
      "Valores estimados nao representam receita realizada.",
    ],
    porTipo: [...categorias.entries()].map(([tipo, valores]) => ({
      tipo,
      quantidade: valores.length,
      mediaValor: media(valores.map((item) => item.valor)),
      valoresEstimados: valores.filter((item) => item.tipoValor === "ESTIMADO").length,
      valoresReais: valores.filter((item) => item.tipoValor === "REAL").length,
    })),
  };
}

export function analisarVidaUtil(equipamentos: SnapshotEquipamentoAnalitico[]) {
  const ordem: Record<string, number> = {
    NOVO: 0,
    BOM_ESTADO: 1,
    USADO_LEVE: 2,
    USADO_MODERADO: 3,
    DANIFICADO_LEVE: 4,
    DANIFICADO_GRAVE: 5,
    INSERVIVEL: 6,
  };
  const previsoes = equipamentos.map((equipamento) => {
    const historico = equipamento.historicoEstados
      .filter((item) => Number.isFinite(item.dataHora.getTime()))
      .sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime());
    if (historico.length < 2) {
      return {
        equipamentoId: equipamento.id,
        estimativaDisponivel: false,
        motivo: "Historico insuficiente: sao necessarios pelo menos dois estados datados.",
      };
    }
    const origem = historico[0]!.dataHora.getTime();
    const pontos = historico.map((item) => ({
      x: (item.dataHora.getTime() - origem) / 86_400_000,
      y: ordem[item.estadoFisico] ?? 0,
    }));
    const regressao = regressaoLinear(pontos);
    if (regressao.inclinacao <= 0) {
      return {
        equipamentoId: equipamento.id,
        estimativaDisponivel: false,
        motivo: "A serie nao apresenta degradacao crescente.",
      };
    }
    const diasParaInservivel = (6 - regressao.intercepto) / regressao.inclinacao;
    if (!Number.isFinite(diasParaInservivel)) {
      return {
        equipamentoId: equipamento.id,
        estimativaDisponivel: false,
        motivo: "Nao foi possivel estimar o periodo.",
      };
    }
    const diasRestantes = Math.max(0, diasParaInservivel - pontos.at(-1)!.x);
    return {
      equipamentoId: equipamento.id,
      estimativaDisponivel: true,
      metodo: "Regressao linear simples sobre a ordem dos estados fisicos",
      dadosHistoricos: historico,
      periodoEstimadoDias: Math.round(diasRestantes),
      dataEstimadaInservivel: new Date(Date.now() + diasRestantes * 86_400_000),
      estimativa: "Estimativa probabilistica, nao uma garantia.",
    };
  });
  return {
    metodo: "Regressao linear simples por idade da observacao",
    historicoCount: equipamentos.reduce(
      (total, equipamento) => total + equipamento.historicoEstados.length,
      0,
    ),
    previsoes,
  };
}

function media(valores: number[]) {
  return valores.reduce((total, valor) => total + valor, 0) / valores.length;
}

function regressaoLinear(pontos: Array<{ x: number; y: number }>) {
  const mediaX = media(pontos.map((ponto) => ponto.x));
  const mediaY = media(pontos.map((ponto) => ponto.y));
  const numerador = pontos.reduce(
    (total, ponto) => total + (ponto.x - mediaX) * (ponto.y - mediaY),
    0,
  );
  const denominador = pontos.reduce(
    (total, ponto) => total + (ponto.x - mediaX) ** 2,
    0,
  );
  const inclinacao = denominador === 0 ? 0 : numerador / denominador;
  return { inclinacao, intercepto: mediaY - inclinacao * mediaX };
}
