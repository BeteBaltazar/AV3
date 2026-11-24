import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { StatusRastreamento } from "../domain/enums/StatusRastreamento.js";
import { RepositorioArquivo } from "../infrastructure/RepositorioArquivo.js";
import { ControlePermissoes } from "../security/ControlePermissoes.js";
import { Permissao } from "../security/Permissao.js";

export class ServicoRelatorio {
  public constructor(
    private readonly repositorio: RepositorioArquivo,
    private readonly controlePermissoes: ControlePermissoes,
    private papel: PapelUsuario,
  ) {}

  public definirPapel(papel: PapelUsuario): void {
    this.papel = papel;
  }

  public gerarRelatorioPorOrganizacao(
    organizacaoId: string,
    periodo: { inicio: Date; fim: Date },
  ): string {
    this.exigirRelatorio();
    const lotes = this.repositorio
      .listarEntidades("lotes.json")
      .filter(
        (lote) =>
          lote.organizacaoId === organizacaoId &&
          new Date(String(lote.dataEntrada)) >= periodo.inicio &&
          new Date(String(lote.dataEntrada)) <= periodo.fim,
      );

    return JSON.stringify(lotes);
  }

  public gerarRelatorioPorStatus(status: StatusRastreamento): string {
    this.exigirRelatorio();
    const equipamentos = this.repositorio
      .listarEntidades("equipamentos.json")
      .filter((equipamento) => equipamento.statusRastreamento === status);

    return JSON.stringify(equipamentos);
  }

  public gerarRelatorioFinanceiro(
    periodo: { inicio: Date; fim: Date },
  ): string {
    this.exigirRelatorio();
    const contratos = this.repositorio
      .listarEntidades("contratos.json")
      .filter(
        (contrato) =>
          new Date(String(contrato.dataAssinatura)) >= periodo.inicio &&
          new Date(String(contrato.dataAssinatura)) <= periodo.fim,
      );

    return JSON.stringify(contratos);
  }

  private exigirRelatorio(): void {
    this.controlePermissoes.exigirPermissao(
      this.papel,
      Permissao.GERAR_RELATORIOS,
    );
  }
}
