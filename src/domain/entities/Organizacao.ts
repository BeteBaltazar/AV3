export interface DadosOrganizacao {
  id: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
  dataCadastro: Date;
  ativo: boolean;
  contratoVigente: boolean;
}

export class Organizacao {
  public id: string;
  public razaoSocial: string;
  public cnpj: string;
  public inscricaoEstadual: string;
  public enderecoCompleto: string;
  public telefone: string;
  public email: string;
  public dataCadastro: Date;
  public ativo: boolean;
  public contratoVigente: boolean;

  public constructor(dados: DadosOrganizacao) {
    this.id = dados.id;
    this.razaoSocial = dados.razaoSocial;
    this.cnpj = dados.cnpj;
    this.inscricaoEstadual = dados.inscricaoEstadual;
    this.enderecoCompleto = dados.enderecoCompleto;
    this.telefone = dados.telefone;
    this.email = dados.email;
    this.dataCadastro = new Date(dados.dataCadastro);
    this.ativo = dados.ativo;
    this.contratoVigente = dados.contratoVigente;
  }

  public alterarEndereco(novoEndereco: string): void {
    this.enderecoCompleto = novoEndereco;
  }

  public desativar(): void {
    this.ativo = false;
  }
}
