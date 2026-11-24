import { PapelUsuario } from "../domain/enums/PapelUsuario.js";
import { Permissao } from "./Permissao.js";

const permissoesPorPapel: ReadonlyMap<PapelUsuario, ReadonlySet<Permissao>> =
  new Map<PapelUsuario, ReadonlySet<Permissao>>([
    [
      PapelUsuario.ADMINISTRADOR,
      new Set(Object.values(Permissao)),
    ],
    [
      PapelUsuario.OPERADOR_CADASTRO,
      new Set([
        Permissao.CADASTRAR_ORGANIZACAO,
        Permissao.GERENCIAR_CONTRATOS,
      ]),
    ],
    [
      PapelUsuario.GESTOR_ALMOXARIFADO,
      new Set([
        Permissao.REGISTRAR_CHEGADA_LOTE,
        Permissao.TRIAR_EQUIPAMENTO,
        Permissao.ALOCAR_CODIGO_BARRAS,
      ]),
    ],
    [
      PapelUsuario.AUDITOR,
      new Set([
        Permissao.CONSULTAR_HISTORICOS,
        Permissao.GERAR_RELATORIOS,
      ]),
    ],
  ]);

export class ControlePermissoes {
  public temPermissao(
    papel: PapelUsuario,
    permissao: Permissao,
  ): boolean {
    return permissoesPorPapel.get(papel)?.has(permissao) ?? false;
  }

  public exigirPermissao(
    papel: PapelUsuario,
    permissao: Permissao,
  ): void {
    if (!this.temPermissao(papel, permissao)) {
      throw new Error(
        `Papel ${papel} nao possui a permissao ${permissao}.`,
      );
    }
  }

  public listarPermissoes(papel: PapelUsuario): Permissao[] {
    return [...(permissoesPorPapel.get(papel) ?? [])];
  }
}
