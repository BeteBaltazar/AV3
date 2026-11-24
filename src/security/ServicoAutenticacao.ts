import { Credencial } from "./Credencial.js";
import { Sessao } from "./Sessao.js";
import { RegistradorJournal } from "../audit/RegistradorJournal.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { ControlePermissoes } from "./ControlePermissoes.js";
import { Permissao } from "./Permissao.js";
import { RepositorioArquivo } from "../infrastructure/RepositorioArquivo.js";

export interface DadosPublicosUsuario {
  usuario: string;
  papel: PapelUsuario;
  ultimoAcesso: Date;
}

export interface AlteracoesUsuario {
  senha?: string;
  papel?: PapelUsuario;
}

export class ServicoAutenticacao {
  public sessoesAtivas: Sessao[] = [];

  public constructor(
    public credenciais: Credencial[] = [],
    private readonly registradorJournal?: RegistradorJournal,
    private readonly controlePermissoes?: ControlePermissoes,
    private readonly repositorio?: RepositorioArquivo,
    private readonly arquivoCredenciais = "credenciais.json",
  ) {}

  public login(usuario: string, senha: string): Sessao {
    const usuarioNormalizado = usuario.trim();
    const credencial = this.credenciais.find(
      (item) => item.usuario === usuarioNormalizado,
    );

    if (!credencial || !credencial.autenticar(usuarioNormalizado, senha)) {
      throw new Error("Usuario ou senha invalidos.");
    }

    const sessao = new Sessao(credencial.usuario, credencial.papel);
    this.sessoesAtivas.push(sessao);
    this.registradorJournal?.registrar({
      operacao: "LOGIN",
      entidade: "Sessao",
      dadosAntes: null,
      dadosDepois: sessao,
      usuarioResponsavel: usuarioNormalizado,
    });
    return sessao;
  }

  public logout(token: string): void {
    const sessao = this.sessoesAtivas.find((item) => item.token === token);
    this.sessoesAtivas = this.sessoesAtivas.filter(
      (sessao) => sessao.token !== token,
    );
    if (sessao) {
      this.registradorJournal?.registrar({
        operacao: "LOGOUT",
        entidade: "Sessao",
        dadosAntes: sessao,
        dadosDepois: null,
        usuarioResponsavel: sessao.usuario,
      });
    }
  }

  public validarToken(token: string): boolean {
    this.sessoesAtivas = this.sessoesAtivas.filter((sessao) =>
      sessao.isValida(),
    );
    const sessao = this.sessoesAtivas.find(
      (item) => item.token === token,
    );

    if (!sessao || !sessao.isValida()) {
      return false;
    }

    sessao.renovar();
    return true;
  }

  public alterarSenha(
    usuario: string,
    senhaAntiga: string,
    senhaNova: string,
  ): boolean {
    const credencial = this.credenciais.find(
      (item) => item.usuario === usuario,
    );

    if (!credencial || !credencial.verificarSenha(senhaAntiga)) {
      return false;
    }

    credencial.atualizarSenha(senhaNova);
    this.registradorJournal?.registrar({
      operacao: "ALTERAR_SENHA",
      entidade: "Credencial",
      dadosAntes: { usuario },
      dadosDepois: { usuario },
      usuarioResponsavel: usuario,
    });
    return true;
  }

  public criarUsuario(
    token: string,
    usuario: string,
    senha: string,
    papel: PapelUsuario,
  ): Credencial {
    if (!this.controlePermissoes || !this.repositorio) {
      throw new Error("Gerenciamento de contas nao esta configurado.");
    }

    const sessao = this.sessoesAtivas.find((item) => item.token === token);
    if (!sessao || !this.validarToken(token)) {
      throw new Error("Sessao invalida ou expirada.");
    }

    this.controlePermissoes.exigirPermissao(
      sessao.papel,
      Permissao.GERENCIAR_CONTAS,
    );

    const usuarioNormalizado = usuario.trim();
    if (!usuarioNormalizado || !senha) {
      throw new Error("Usuario e senha sao obrigatorios.");
    }

    if (this.credenciais.some((item) => item.usuario === usuarioNormalizado)) {
      throw new Error(`Usuario ja cadastrado: ${usuarioNormalizado}`);
    }

    const credencial = Credencial.criar(usuarioNormalizado, senha, papel);
    this.repositorio.salvarEntidade(this.arquivoCredenciais, {
      ...credencial.paraPersistencia(),
    });
    this.credenciais.push(credencial);
    this.registradorJournal?.registrar({
      operacao: "CRIAR",
      entidade: "Credencial",
      dadosAntes: null,
      dadosDepois: {
        usuario: credencial.usuario,
        papel: credencial.papel,
      },
      usuarioResponsavel: sessao.usuario,
    });

    return credencial;
  }

  public listarUsuarios(token: string): DadosPublicosUsuario[] {
    this.exigirPermissaoDeConta(token);
    return this.credenciais.map(({ usuario, papel, ultimoAcesso }) => ({
      usuario,
      papel,
      ultimoAcesso: new Date(ultimoAcesso),
    }));
  }

  public editarUsuario(
    token: string,
    usuario: string,
    alteracoes: AlteracoesUsuario,
  ): DadosPublicosUsuario {
    const sessao = this.exigirPermissaoDeConta(token);
    const credencialExistente = this.buscarCredencial(usuario);
    const senhaInformada = alteracoes.senha !== undefined;
    const papelInformado = alteracoes.papel !== undefined;

    if (!senhaInformada && !papelInformado) {
      throw new Error("Informe --senha e/ou --papel para editar o usuario.");
    }
    if (senhaInformada && !alteracoes.senha?.trim()) {
      throw new Error("A senha nao pode ser vazia.");
    }
    if (
      papelInformado &&
      credencialExistente.papel === PapelUsuario.ADMINISTRADOR &&
      alteracoes.papel !== PapelUsuario.ADMINISTRADOR &&
      this.contarAdministradores() <= 1
    ) {
      throw new Error("Nao e possivel remover o ultimo administrador.");
    }

    const credencialAtualizada = new Credencial(
      credencialExistente.paraPersistencia(),
    );
    if (senhaInformada) {
      credencialAtualizada.atualizarSenha(alteracoes.senha!);
    }
    if (papelInformado) {
      credencialAtualizada.papel = alteracoes.papel!;
    }

    this.persistirCredencial(credencialAtualizada);
    const indice = this.credenciais.indexOf(credencialExistente);
    this.credenciais[indice] = credencialAtualizada;
    for (const sessaoAtiva of this.sessoesAtivas) {
      if (sessaoAtiva.usuario === credencialAtualizada.usuario) {
        sessaoAtiva.papel = credencialAtualizada.papel;
      }
    }

    this.registradorJournal?.registrar({
      operacao: "EDITAR",
      entidade: "Credencial",
      dadosAntes: {
        usuario: credencialExistente.usuario,
        papel: credencialExistente.papel,
      },
      dadosDepois: {
        usuario: credencialAtualizada.usuario,
        papel: credencialAtualizada.papel,
        senhaAlterada: senhaInformada,
      },
      usuarioResponsavel: sessao.usuario,
    });
    return {
      usuario: credencialAtualizada.usuario,
      papel: credencialAtualizada.papel,
      ultimoAcesso: new Date(credencialAtualizada.ultimoAcesso),
    };
  }

  public excluirUsuario(token: string, usuario: string): void {
    const sessao = this.exigirPermissaoDeConta(token);
    const credencial = this.buscarCredencial(usuario);

    if (credencial.usuario === sessao.usuario) {
      throw new Error("Nao e possivel excluir a propria conta.");
    }
    if (
      credencial.papel === PapelUsuario.ADMINISTRADOR &&
      this.contarAdministradores() <= 1
    ) {
      throw new Error("Nao e possivel excluir o ultimo administrador.");
    }

    if (!this.repositorio) {
      throw new Error("Gerenciamento de contas nao esta configurado.");
    }
    this.repositorio.excluirEntidade(this.arquivoCredenciais, credencial.usuario);
    this.credenciais = this.credenciais.filter((item) => item !== credencial);
    this.sessoesAtivas = this.sessoesAtivas.filter(
      (sessaoAtiva) => sessaoAtiva.usuario !== credencial.usuario,
    );
    this.registradorJournal?.registrar({
      operacao: "EXCLUIR",
      entidade: "Credencial",
      dadosAntes: {
        usuario: credencial.usuario,
        papel: credencial.papel,
      },
      dadosDepois: null,
      usuarioResponsavel: sessao.usuario,
    });
  }

  private exigirPermissaoDeConta(token: string): Sessao {
    if (!this.controlePermissoes || !this.repositorio) {
      throw new Error("Gerenciamento de contas nao esta configurado.");
    }

    const sessao = this.sessoesAtivas.find((item) => item.token === token);
    if (!sessao || !this.validarToken(token)) {
      throw new Error("Sessao invalida ou expirada.");
    }

    this.controlePermissoes.exigirPermissao(
      sessao.papel,
      Permissao.GERENCIAR_CONTAS,
    );
    return sessao;
  }

  private buscarCredencial(usuario: string): Credencial {
    const usuarioNormalizado = usuario.trim();
    const credencial = this.credenciais.find(
      (item) => item.usuario === usuarioNormalizado,
    );
    if (!credencial) {
      throw new Error(`Usuario nao encontrado: ${usuarioNormalizado}`);
    }
    return credencial;
  }

  private contarAdministradores(): number {
    return this.credenciais.filter(
      (credencial) => credencial.papel === PapelUsuario.ADMINISTRADOR,
    ).length;
  }

  private persistirCredencial(credencial: Credencial): void {
    if (!this.repositorio) {
      throw new Error("Persistencia de credenciais nao esta configurada.");
    }
    this.repositorio.salvarEntidade(this.arquivoCredenciais, {
      ...credencial.paraPersistencia(),
    });
  }
}
