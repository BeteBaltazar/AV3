import { RegistradorJournal } from "../audit/RegistradorJournal.js";
import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import {
  EntidadePersistida,
  RepositorioArquivo,
} from "../infrastructure/RepositorioArquivo.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { Permissao } from "../security/Permissao.js";

const ARQUIVO_PARAMETROS = "parametros-globais.json";
const ID_PARAMETROS = "parametros-globais";
export const COEFICIENTE_DEPRECIACAO_PADRAO = 0.08;

export interface ParametrosGlobais {
  id: typeof ID_PARAMETROS;
  aliquotasImpostos: Record<string, number>;
  coeficienteDepreciacao: number;
}

export class ServicoParametrosGlobais {
  public constructor(
    private readonly repositorio: RepositorioArquivo,
    private readonly controlePermissoes: ControlePermissoes,
    private papel: PapelUsuario,
    private readonly registradorJournal?: RegistradorJournal,
  ) {}

  public definirPapel(papel: PapelUsuario): void {
    this.papel = papel;
  }

  public listar(): ParametrosGlobais {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.CONFIGURAR_PARAMETROS_GLOBAIS,
    );
    return this.carregar();
  }

  public configurarAliquotaImposto(nomeImposto: string, aliquota: number): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.CONFIGURAR_ALIQUOTAS_IMPOSTOS,
    );
    const nomeNormalizado = nomeImposto.trim().toUpperCase();
    this.validarAliquota(nomeNormalizado, aliquota);

    const parametrosAnteriores = this.carregar();
    const parametrosAtualizados: ParametrosGlobais = {
      ...parametrosAnteriores,
      aliquotasImpostos: {
        ...parametrosAnteriores.aliquotasImpostos,
        [nomeNormalizado]: aliquota,
      },
    };
    this.salvar(parametrosAtualizados);
    this.registrarAlteracao(parametrosAnteriores, parametrosAtualizados);
  }

  public configurarCoeficienteDepreciacao(coeficiente: number): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.CONFIGURAR_DEPRECIACAO,
    );
    this.validarFracao("Coeficiente de depreciacao", coeficiente);

    const parametrosAnteriores = this.carregar();
    const parametrosAtualizados: ParametrosGlobais = {
      ...parametrosAnteriores,
      coeficienteDepreciacao: coeficiente,
    };
    this.salvar(parametrosAtualizados);
    this.registrarAlteracao(parametrosAnteriores, parametrosAtualizados);
  }

  public obterCoeficienteDepreciacao(): number {
    return this.carregar().coeficienteDepreciacao;
  }

  private carregar(): ParametrosGlobais {
    const dados = this.repositorio.carregarEntidade(
      ARQUIVO_PARAMETROS,
      ID_PARAMETROS,
    );
    if (!dados) {
      return {
        id: ID_PARAMETROS,
        aliquotasImpostos: {},
        coeficienteDepreciacao: COEFICIENTE_DEPRECIACAO_PADRAO,
      };
    }

    const aliquotas = dados.aliquotasImpostos;
    if (
      typeof aliquotas !== "object" ||
      aliquotas === null ||
      Array.isArray(aliquotas)
    ) {
      throw new Error("Configuracao de aliquotas de impostos invalida.");
    }

    const coeficiente = dados.coeficienteDepreciacao;
    if (typeof coeficiente !== "number" || !Number.isFinite(coeficiente)) {
      throw new Error("Coeficiente de depreciacao persistido invalido.");
    }
    this.validarFracao("Coeficiente de depreciacao", coeficiente);

    for (const [nome, valor] of Object.entries(aliquotas)) {
      if (typeof valor !== "number") {
        throw new Error(`Aliquota persistida invalida: ${nome}`);
      }
      this.validarFracao(`Aliquota de ${nome}`, valor);
    }

    return {
      id: ID_PARAMETROS,
      aliquotasImpostos: { ...aliquotas } as Record<string, number>,
      coeficienteDepreciacao: coeficiente,
    };
  }

  private salvar(parametros: ParametrosGlobais): void {
    this.repositorio.salvarEntidade(
      ARQUIVO_PARAMETROS,
      parametros as unknown as EntidadePersistida,
    );
  }

  private validarAliquota(nomeImposto: string, aliquota: number): void {
    if (!nomeImposto) {
      throw new Error("Informe o nome do imposto.");
    }
    this.validarFracao(`Aliquota de ${nomeImposto}`, aliquota);
  }

  private validarFracao(nome: string, valor: number): void {
    if (!Number.isFinite(valor) || valor < 0 || valor > 1) {
      throw new Error(`${nome} deve estar entre 0 e 1.`);
    }
  }

  private registrarAlteracao(
    parametrosAnteriores: ParametrosGlobais,
    parametrosAtualizados: ParametrosGlobais,
  ): void {
    this.registradorJournal?.registrar({
      operacao: "CONFIGURAR",
      entidade: "ParametrosGlobais",
      dadosAntes: parametrosAnteriores,
      dadosDepois: parametrosAtualizados,
      usuarioResponsavel: this.papel,
    });
  }
}
