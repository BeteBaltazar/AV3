export abstract class Validador {
  protected mensagemErro = "";

  public abstract validar(objeto: unknown): boolean;

  public obterMensagemErro(): string {
    return this.mensagemErro;
  }

  protected definirErro(mensagem: string): false {
    this.mensagemErro = mensagem;
    return false;
  }

  protected limparErro(): void {
    this.mensagemErro = "";
  }
}
