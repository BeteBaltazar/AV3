import { Validador } from "./Validador.js";

export class ValidadorCNPJ extends Validador {
  public override validar(cnpj: unknown): boolean {
    this.limparErro();

    if (typeof cnpj !== "string") {
      return this.definirErro("CNPJ deve ser informado como texto.");
    }

    const digitos = cnpj.replace(/\D/g, "");

    if (digitos.length !== 14 || /^([0-9])\1{13}$/.test(digitos)) {
      return this.definirErro("CNPJ deve conter 14 digitos validos.");
    }

    const primeiroDigito = this.calcularDigito(digitos.slice(0, 12), 5);
    const segundoDigito = this.calcularDigito(digitos.slice(0, 12) + primeiroDigito, 6);
    const valido = digitos.endsWith(`${primeiroDigito}${segundoDigito}`);

    return valido || this.definirErro("CNPJ invalido.");
  }

  private calcularDigito(base: string, pesoInicial: number): string {
    let soma = 0;

    for (let indice = 0; indice < base.length; indice += 1) {
      const peso = ((pesoInicial - indice - 2 + 8) % 8) + 2;
      soma += Number(base[indice]) * peso;
    }

    const resto = soma % 11;
    return String(resto < 2 ? 0 : 11 - resto);
  }
}
