export interface DadosContrato {
  id: string;
  organizacaoId: string;
  dataAssinatura: Date;
  dataVencimento: Date;
  clausulas: string;
  valorMensal: number;
  renovacaoAutomatica: boolean;
}

export class Contrato {
  public id: string;
  public organizacaoId: string;
  public dataAssinatura: Date;
  public dataVencimento: Date;
  public clausulas: string;
  public valorMensal: number;
  public renovacaoAutomatica: boolean;

  public constructor(dados: DadosContrato) {
    this.id = dados.id;
    this.organizacaoId = dados.organizacaoId;
    this.dataAssinatura = new Date(dados.dataAssinatura);
    this.dataVencimento = new Date(dados.dataVencimento);
    this.clausulas = dados.clausulas;
    this.valorMensal = dados.valorMensal;
    this.renovacaoAutomatica = dados.renovacaoAutomatica;
  }

  public estaVigente(): boolean {
    return this.dataVencimento.getTime() >= Date.now();
  }

  public renovar(novoVencimento: Date): void {
    this.dataVencimento = new Date(novoVencimento);
  }
}
