import { Validador } from "./Validador.js";

const DIAS_LIMITE = 90;

export class ValidadorDataEntrada extends Validador {
  public override validar(data: unknown): boolean {
    this.limparErro();

    if (!(data instanceof Date) || Number.isNaN(data.getTime())) {
      return this.definirErro("Data de entrada invalida.");
    }

    const agora = new Date();
    const limiteInferior = new Date(agora);
    limiteInferior.setDate(limiteInferior.getDate() - DIAS_LIMITE);

    if (data > agora) {
      return this.definirErro("Data de entrada nao pode ser futura.");
    }

    if (data < limiteInferior) {
      return this.definirErro("Data de entrada nao pode ser anterior a 90 dias.");
    }

    return true;
  }
}
