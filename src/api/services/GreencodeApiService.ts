import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Equipamento as DomainEquipamento } from "../../domain/entities/Equipamento.js";
import { EstadoFisico } from "../../domain/enums/EstadoFisico.js";
import { PapelUsuario } from "../../domain/enums/PapelUsuario.js";
import { StatusLote } from "../../domain/enums/StatusLote.js";
import { StatusRastreamento } from "../../domain/enums/StatusRastreamento.js";
import { TipoEquipamento } from "../../domain/enums/TipoEquipamento.js";
import { ValidadorCNPJ } from "../../domain/validators/ValidadorCNPJ.js";
import { ValidadorDataEntrada } from "../../domain/validators/ValidadorDataEntrada.js";
import { ValidadorEstadoFisico } from "../../domain/validators/ValidadorEstadoFisico.js";
import { ControlePermissoes } from "../../security/ControlePermissoes.js";
import { Permissao } from "../../security/Permissao.js";
import { ApiError } from "../errors.js";
import { hashPassword, verifyPassword } from "../passwords.js";
import type {
  ApiRepository,
  AtualizacaoContrato,
  AtualizacaoLote,
  NovoEquipamento,
  NovoLote,
} from "../repositories/ApiRepository.js";
import {
  analisarEficiencia,
  analisarRentabilidade,
  analisarVidaUtil,
  type SnapshotEquipamentoAnalitico,
  type SnapshotLoteAnalitico,
} from "../../analysis/Analises.js";

export class GreencodeApiService {
  private readonly controlePermissoes = new ControlePermissoes();
  private readonly validadorCNPJ = new ValidadorCNPJ();
  private readonly validadorDataEntrada = new ValidadorDataEntrada();
  private readonly validadorEstadoFisico = new ValidadorEstadoFisico();

  public constructor(private readonly repository: ApiRepository) {}

  public async login(usuario: string, senha: string) {
    const normalized = usuario.trim();
    const user = normalized
      ? await this.repository.findUserByUsername(normalized)
      : null;
    if (
      !user ||
      !(await verifyPassword(
        senha,
        user.senhaHash,
        user.senhaSalt,
        user.hashScheme,
      ))
    ) {
      throw new ApiError(401, "Usuario ou senha invalidos.", "INVALID_CREDENTIALS");
    }

    const upgrade = user.hashScheme === "sha256-v1" ? await hashPassword(senha) : null;
    const updated = await this.repository.updateUser(user.id, user.version, {
      ultimoAcesso: new Date(),
      ...(upgrade ?? {}),
    });
    return {
      id: updated.id,
      usuario: updated.usuario,
      papel: validarPapel(updated.papel),
    };
  }

  public async authenticateUser(id: string) {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new ApiError(401, "Token invalido ou expirado.", "UNAUTHENTICATED");
    }
    return {
      id: user.id,
      usuario: user.usuario,
      papel: validarPapel(user.papel),
    };
  }

  public async listUsers(actor: Actor) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTAS, this.controlePermissoes);
    return this.repository.listUsers();
  }

  public async getUser(actor: Actor, id: string) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTAS, this.controlePermissoes);
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new ApiError(404, "Usuario nao encontrado.", "NOT_FOUND");
    }
    return user;
  }

  public async createUser(
    actor: Actor,
    data: { usuario: string; senha: string; papel: PapelUsuario },
  ) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTAS, this.controlePermissoes);
    const usuario = data.usuario.trim();
    if (!usuario || !data.senha.trim()) {
      throw new ApiError(400, "Usuario e senha sao obrigatorios.", "INVALID_INPUT");
    }
    return this.repository.createUser({
      usuario,
      ...(await hashPassword(data.senha)),
      papel: data.papel,
    });
  }

  public async updateUser(
    actor: Actor,
    id: string,
    data: { version: number; senha?: string; papel?: PapelUsuario },
  ) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTAS, this.controlePermissoes);
    if (data.senha === undefined && data.papel === undefined) {
      throw new ApiError(400, "Informe uma senha ou papel para atualizar.", "INVALID_INPUT");
    }
    const current = await this.repository.findUserById(id);
    if (!current) {
      throw new ApiError(404, "Usuario nao encontrado.", "NOT_FOUND");
    }
    const password = data.senha === undefined ? {} : await hashPassword(data.senha);
    return this.repository.updateUser(id, data.version, {
      ...password,
      ...(data.papel === undefined ? {} : { papel: data.papel }),
    });
  }

  public async deleteUser(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTAS, this.controlePermissoes);
    if (actor.id === id) {
      throw new ApiError(409, "Nao e possivel excluir a propria conta.", "SELF_DELETE");
    }
    return this.repository.deleteUser(id, version);
  }

  public async listOrganizations(actor: Actor, activeOnly = true) {
    exigirConsultaOrganizacao(actor.papel, this.controlePermissoes);
    return this.repository.listOrganizations(activeOnly);
  }

  public async getOrganization(actor: Actor, id: string) {
    exigirConsultaOrganizacao(actor.papel, this.controlePermissoes);
    const organization = await this.repository.findOrganization(id);
    if (!organization) {
      throw new ApiError(404, "Organizacao nao encontrada.", "NOT_FOUND");
    }
    return organization;
  }

  public async createOrganization(
    actor: Actor,
    data: {
      id?: string;
      razaoSocial: string;
      cnpj: string;
      inscricaoEstadual: string;
      enderecoCompleto: string;
      telefone: string;
      email: string;
    },
  ) {
    exigirPermissao(actor.papel, Permissao.CADASTRAR_ORGANIZACAO, this.controlePermissoes);
    if (!this.validadorCNPJ.validar(data.cnpj)) {
      throw new ApiError(400, this.validadorCNPJ.obterMensagemErro(), "INVALID_CNPJ");
    }
    const cnpjNormalizado = data.cnpj.replace(/\D/g, "");
    return this.repository.createOrganization({
      id: data.id?.trim() || randomUUID(),
      ...data,
      cnpjNormalizado,
      dataCadastro: new Date(),
    });
  }

  public async deactivateOrganization(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.DESATIVAR_ORGANIZACAO, this.controlePermissoes);
    await this.getOrganizationForVersion(id, version);
    return this.repository.deactivateOrganization(id, version);
  }

  public async deleteOrganization(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.APAGAR_ORGANIZACAO, this.controlePermissoes);
    await this.getOrganizationForVersion(id, version);
    return this.repository.deleteOrganization(id, version);
  }

  public async createContract(
    actor: Actor,
    organizationId: string,
    data: {
      id?: string;
      dataAssinatura: Date;
      dataVencimento: Date;
      clausulas: string;
      valorMensal: number;
      renovacaoAutomatica: boolean;
    },
  ) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTRATOS, this.controlePermissoes);
    if (
      Number.isNaN(data.dataAssinatura.getTime()) ||
      Number.isNaN(data.dataVencimento.getTime()) ||
      data.dataVencimento < data.dataAssinatura
    ) {
      throw new ApiError(400, "Datas do contrato invalidas.", "INVALID_DATES");
    }
    if (!Number.isFinite(data.valorMensal) || data.valorMensal < 0 || !data.clausulas.trim()) {
      throw new ApiError(400, "Clausulas e valor mensal valido sao obrigatorios.", "INVALID_CONTRACT");
    }
    return this.repository.createContract({
      ...data,
      id: data.id?.trim() || randomUUID(),
      organizacaoId: organizationId,
    });
  }

  public async renewContract(
    actor: Actor,
    id: string,
    data: { version: number; dataVencimento: Date },
  ) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTRATOS, this.controlePermissoes);
    const contract = await this.repository.findContract(id);
    if (!contract) {
      throw new ApiError(404, "Contrato nao encontrado.", "NOT_FOUND");
    }
    if (contract.version !== data.version) {
      throw conflitoVersao();
    }
    if (data.dataVencimento < contract.dataAssinatura) {
      throw new ApiError(400, "Vencimento nao pode ser anterior a assinatura.", "INVALID_DATES");
    }
    return this.repository.renewContract(id, data.version, data.dataVencimento);
  }

  public async listContractsByOrganization(actor: Actor, organizationId: string) {
    exigirPermissao(actor.papel, Permissao.CONSULTAR_HISTORICOS, this.controlePermissoes);
    const organization = await this.repository.findOrganization(organizationId);
    if (!organization) {
      throw new ApiError(404, "Organizacao nao encontrada.", "NOT_FOUND");
    }
    return this.repository.listContractsByOrganization(organizationId);
  }

  public async updateContract(
    actor: Actor,
    id: string,
    data: {
      version: number;
      dataAssinatura?: Date;
      dataVencimento?: Date;
      clausulas?: string;
      valorMensal?: number;
      renovacaoAutomatica?: boolean;
    },
  ) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTRATOS, this.controlePermissoes);
    const contract = await this.repository.findContract(id);
    if (!contract) {
      throw new ApiError(404, "Contrato nao encontrado.", "NOT_FOUND");
    }
    if (contract.version !== data.version) {
      throw conflitoVersao();
    }
    const patch: AtualizacaoContrato = {
      ...(data.dataAssinatura === undefined ? {} : { dataAssinatura: data.dataAssinatura }),
      ...(data.dataVencimento === undefined ? {} : { dataVencimento: data.dataVencimento }),
      ...(data.clausulas === undefined ? {} : { clausulas: data.clausulas }),
      ...(data.valorMensal === undefined ? {} : { valorMensal: data.valorMensal }),
      ...(data.renovacaoAutomatica === undefined
        ? {}
        : { renovacaoAutomatica: data.renovacaoAutomatica }),
    };
    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "Informe ao menos um campo para atualizar.", "INVALID_INPUT");
    }
    const dataAssinatura = patch.dataAssinatura ?? contract.dataAssinatura;
    const dataVencimento = patch.dataVencimento ?? contract.dataVencimento;
    if (
      Number.isNaN(dataAssinatura.getTime()) ||
      Number.isNaN(dataVencimento.getTime()) ||
      dataVencimento < dataAssinatura
    ) {
      throw new ApiError(400, "Datas do contrato invalidas.", "INVALID_DATES");
    }
    if (
      (patch.clausulas !== undefined && !patch.clausulas.trim()) ||
      (patch.valorMensal !== undefined &&
        (!Number.isFinite(patch.valorMensal) || patch.valorMensal < 0))
    ) {
      throw new ApiError(400, "Clausulas e valor mensal validos sao obrigatorios.", "INVALID_CONTRACT");
    }
    return this.repository.updateContract(id, data.version, patch);
  }

  public async deleteContract(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTRATOS, this.controlePermissoes);
    return this.repository.deleteContract(id, version);
  }

  public async getContract(actor: Actor, id: string) {
    exigirPermissao(actor.papel, Permissao.CONSULTAR_HISTORICOS, this.controlePermissoes);
    const contract = await this.repository.findContract(id);
    if (!contract) {
      throw new ApiError(404, "Contrato nao encontrado.", "NOT_FOUND");
    }
    return contract;
  }

  public async listLots(actor: Actor, dataInicio?: Date, dataFim?: Date) {
    exigirPermissao(actor.papel, Permissao.CONSULTAR_HISTORICOS, this.controlePermissoes);
    if ((dataInicio === undefined) !== (dataFim === undefined)) {
      throw new ApiError(400, "Informe dataInicio e dataFim em conjunto.", "INVALID_PERIOD");
    }
    if (dataInicio && dataFim && dataInicio > dataFim) {
      throw new ApiError(400, "Periodo de consulta invalido.", "INVALID_PERIOD");
    }
    return this.repository.listLots(dataInicio, dataFim);
  }

  public async getLot(actor: Actor, id: string) {
    exigirPermissao(actor.papel, Permissao.CONSULTAR_HISTORICOS, this.controlePermissoes);
    const lot = await this.repository.findLot(id);
    if (!lot) {
      throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
    }
    return lot;
  }

  public async updateLot(
    actor: Actor,
    id: string,
    data: { version: number } & AtualizacaoLote,
  ) {
    exigirPermissao(actor.papel, Permissao.REGISTRAR_CHEGADA_LOTE, this.controlePermissoes);
    const lot = await this.repository.findLot(id);
    if (!lot) {
      throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
    }
    if (lot.version !== data.version) {
      throw conflitoVersao();
    }
    const patch: AtualizacaoLote = {
      ...(data.notaFiscal === undefined ? {} : { notaFiscal: data.notaFiscal }),
      ...(data.transportadora === undefined ? {} : { transportadora: data.transportadora }),
      ...(data.observacoes === undefined ? {} : { observacoes: data.observacoes }),
    };
    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "Informe ao menos um campo para atualizar.", "INVALID_INPUT");
    }
    if (
      (patch.notaFiscal !== undefined && !patch.notaFiscal.trim()) ||
      (patch.transportadora !== undefined && !patch.transportadora.trim())
    ) {
      throw new ApiError(400, "Nota fiscal e transportadora nao podem ficar vazias.", "INVALID_INPUT");
    }
    return this.repository.updateLot(id, data.version, patch);
  }

  public async createLot(
    actor: Actor,
    data: {
      id?: string;
      dataEntrada: Date;
      organizacaoId: string;
      notaFiscal: string;
      transportadora: string;
      observacoes?: string;
      equipamentos?: EquipamentoEntrada[];
    },
  ) {
    exigirPermissao(actor.papel, Permissao.REGISTRAR_CHEGADA_LOTE, this.controlePermissoes);
    if (!this.validadorDataEntrada.validar(data.dataEntrada)) {
      throw new ApiError(400, this.validadorDataEntrada.obterMensagemErro(), "INVALID_ENTRY_DATE");
    }
    const organization = await this.repository.findOrganization(data.organizacaoId);
    if (!organization) {
      throw new ApiError(404, "Organizacao nao encontrada.", "NOT_FOUND");
    }
    const equipment = normalizarEquipamentos(data.equipamentos ?? []);
    const newLot: NovoLote = {
      id: data.id?.trim() || randomUUID(),
      dataEntrada: data.dataEntrada,
      organizacaoId: data.organizacaoId,
      notaFiscal: data.notaFiscal,
      transportadora: data.transportadora,
      observacoes: data.observacoes ?? "",
      equipamentos: equipment,
    };
    return this.repository.createLotWithEquipment(newLot);
  }

  public async addEquipmentToLot(
    actor: Actor,
    lotId: string,
    data: { version: number; equipamentos: EquipamentoEntrada[] },
  ) {
    exigirPermissao(actor.papel, Permissao.REGISTRAR_CHEGADA_LOTE, this.controlePermissoes);
    const lot = await this.repository.findLot(lotId);
    if (!lot) {
      throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
    }
    if (lot.version !== data.version) {
      throw conflitoVersao();
    }
    if (data.equipamentos.length === 0) {
      throw new ApiError(400, "Informe ao menos um equipamento.", "INVALID_INPUT");
    }
    return this.repository.addEquipmentToLot(
      lotId,
      data.version,
      normalizarEquipamentos(data.equipamentos),
    );
  }

  public async triageLot(actor: Actor, id: string, version: number, responsavel: string) {
    exigirPermissao(actor.papel, Permissao.TRIAR_EQUIPAMENTO, this.controlePermissoes);
    const lot = await this.repository.findLot(id);
    if (!lot) {
      throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
    }
    if (lot.version !== version) {
      throw conflitoVersao();
    }
    if (lot.statusProcessamento !== StatusLote.RECEBIDO) {
      throw new ApiError(409, "Somente lotes recebidos podem ser triados.", "INVALID_TRANSITION");
    }
    for (const equipment of lot.equipamentos) {
      if (equipment.statusRastreamento !== StatusRastreamento.AGUARDANDO_TRIAGEM) {
        throw new ApiError(409, "Equipamento do lote nao pode ser triado no estado atual.", "INVALID_TRANSITION");
      }
    }
    return this.repository.triageLot(
      id,
      version,
      lot.equipamentos.map(({ id: equipmentId, version: equipmentVersion }) => ({
        id: equipmentId,
        version: equipmentVersion,
      })),
      responsavel,
    );
  }

  public async deleteLot(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.EXCLUIR_LOTE, this.controlePermissoes);
    await this.repository.deleteLot(id, version);
  }

  public async trackEquipment(actor: Actor, id: string) {
    exigirPermissao(actor.papel, Permissao.CONSULTAR_HISTORICOS, this.controlePermissoes);
    const tracked = await this.repository.trackEquipment(id);
    if (!tracked) {
      throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
    }
    if (!tracked.lote) {
      throw new ApiError(409, "Equipamento nao esta vinculado a um lote.", "UNLINKED_EQUIPMENT");
    }
    return {
      equipamento: tracked,
      lote: tracked.lote,
      organizacao: tracked.lote.organizacao,
      movimentacoes: tracked.historicoMovimentacao,
    };
  }

  public async getEquipment(actor: Actor, id: string) {
    exigirPermissao(actor.papel, Permissao.CONSULTAR_HISTORICOS, this.controlePermissoes);
    const equipment = await this.repository.findEquipment(id);
    if (!equipment) {
      throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
    }
    return equipment;
  }

  public async createEquipment(
    actor: Actor,
    data: EquipamentoEntrada,
  ) {
    exigirPermissao(actor.papel, Permissao.REGISTRAR_CHEGADA_LOTE, this.controlePermissoes);
    return this.repository.createEquipment(normalizarEquipamento(data));
  }

  public async listEquipment(actor: Actor, status?: StatusRastreamento) {
    exigirPermissao(actor.papel, Permissao.GERAR_RELATORIOS, this.controlePermissoes);
    return this.repository.listEquipment(status);
  }

  public async updatePhysicalState(
    actor: Actor,
    id: string,
    data: { version: number; estadoFisico: EstadoFisico; justificativa?: string },
  ) {
    exigirPermissao(actor.papel, Permissao.TRIAR_EQUIPAMENTO, this.controlePermissoes);
    const equipment = await this.repository.findEquipment(id);
    if (!equipment) {
      throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
    }
    if (equipment.version !== data.version) {
      throw conflitoVersao();
    }
    if (
      !this.validadorEstadoFisico.validar({
        estadoAnterior: equipment.estadoFisico,
        novoEstado: data.estadoFisico,
        justificativa: data.justificativa,
      })
    ) {
      throw new ApiError(400, this.validadorEstadoFisico.obterMensagemErro(), "INVALID_PHYSICAL_STATE");
    }
    return this.repository.updatePhysicalState(
      id,
      data.version,
      data.estadoFisico,
      data.justificativa,
      actor.usuario,
    );
  }

  public async moveToDismantle(
    actor: Actor,
    id: string,
    version: number,
    responsavel: string,
  ) {
    exigirPermissao(actor.papel, Permissao.TRIAR_EQUIPAMENTO, this.controlePermissoes);
    const equipment = await this.repository.findEquipment(id);
    if (!equipment) {
      throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
    }
    if (equipment.version !== version) {
      throw conflitoVersao();
    }
    if (equipment.statusRastreamento !== StatusRastreamento.AGUARDANDO_DESMONTE) {
      throw new ApiError(409, "Equipamento precisa passar por triagem antes do desmonte.", "INVALID_TRANSITION");
    }
    return this.repository.moveToDismantle(id, version, responsavel);
  }

  public async unlinkEquipment(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.REGISTRAR_CHEGADA_LOTE, this.controlePermissoes);
    return this.repository.unlinkEquipment(id, version);
  }

  public async deleteEquipment(actor: Actor, id: string, version: number) {
    exigirPermissao(actor.papel, Permissao.GERENCIAR_CONTAS, this.controlePermissoes);
    return this.repository.deleteEquipment(id, version);
  }

  public async calculateDepreciation(actor: Actor, id: string) {
    exigirPermissao(actor.papel, Permissao.GERAR_RELATORIOS, this.controlePermissoes);
    const equipment = await this.repository.findEquipment(id);
    if (!equipment) {
      throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
    }
    const parameters = await this.repository.getParameters();
    const domainEquipment = new DomainEquipamento({
      ...equipment,
      tipo: validarValorEnum(
        equipment.tipo,
        Object.values(TipoEquipamento),
        "Tipo de equipamento persistido invalido.",
        "INVALID_STORED_EQUIPMENT_TYPE",
      ),
      estadoFisico: validarValorEnum(
        equipment.estadoFisico,
        Object.values(EstadoFisico),
        "Estado fisico persistido invalido.",
        "INVALID_STORED_PHYSICAL_STATE",
      ),
      statusRastreamento: validarValorEnum(
        equipment.statusRastreamento,
        Object.values(StatusRastreamento),
        "Status de rastreamento persistido invalido.",
        "INVALID_STORED_TRACKING_STATUS",
      ),
      loteId: equipment.loteId ?? "",
      historicoMovimentacao: [],
    });
    return { id, valor: domainEquipment.calcularDepreciacao(parameters.coeficienteDepreciacao) };
  }

  public async runAnalysis(
    actor: Actor,
    categoria: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL",
    dataInicio?: Date,
    dataFim?: Date,
    owner?: { parceiroId: string; organizacaoId?: string },
  ) {
    exigirPermissao(actor.papel, Permissao.GERAR_RELATORIOS, this.controlePermissoes);
    if (dataInicio && dataFim && dataInicio > dataFim) {
      throw new ApiError(400, "Periodo de consulta invalido.", "INVALID_PERIOD");
    }
    const snapshot = await this.repository.getAnalyticsData(
      dataInicio,
      dataFim,
      owner?.organizacaoId,
    );
    const lotes = snapshot.lotes as unknown as SnapshotLoteAnalitico[];
    const equipamentos = snapshot.equipamentos as unknown as SnapshotEquipamentoAnalitico[];

    if (categoria === "EFICIENCIA_OPERACIONAL") {
      const resultado = analisarEficiencia(lotes);
      return this.repository.saveAnalysis({
        categoria,
        ...(dataInicio ? { dataInicio } : {}),
        ...(dataFim ? { dataFim } : {}),
        metodo: resultado.metodo,
        dadosUtilizados: { lotes: snapshot.lotes.length },
        resultado,
        observacoes: resultado.observacoes.join(" "),
        ...(owner ? { parceiroId: owner.parceiroId } : {}),
        ...(owner?.organizacaoId ? { organizacaoId: owner.organizacaoId } : {}),
      });
    }
    if (categoria === "RENTABILIDADE") {
      const resultado = analisarRentabilidade(equipamentos);
      return this.repository.saveAnalysis({
        categoria,
        ...(dataInicio ? { dataInicio } : {}),
        ...(dataFim ? { dataFim } : {}),
        metodo: resultado.metodo,
        dadosUtilizados: { equipamentos: snapshot.equipamentos.length },
        resultado,
        observacoes: resultado.observacoes.join(" "),
        ...(owner ? { parceiroId: owner.parceiroId } : {}),
        ...(owner?.organizacaoId ? { organizacaoId: owner.organizacaoId } : {}),
      });
    }
    const resultado = analisarVidaUtil(equipamentos);
    return this.repository.saveAnalysis({
      categoria,
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      metodo: resultado.metodo,
      dadosUtilizados: { equipamentos: snapshot.equipamentos.length, historicos: resultado.historicoCount },
      resultado,
      observacoes: "Previsao estatistica estimada; nao representa garantia de vida util.",
      ...(owner ? { parceiroId: owner.parceiroId } : {}),
      ...(owner?.organizacaoId ? { organizacaoId: owner.organizacaoId } : {}),
    });
  }

  public async listAnalysisResults(
    actor: Actor,
    categoria?: string,
    owner?: { parceiroId: string; organizacaoId?: string },
  ) {
    exigirPermissao(actor.papel, Permissao.GERAR_RELATORIOS, this.controlePermissoes);
    return this.repository.listAnalysisResults(
      categoria,
      owner?.parceiroId,
      owner?.organizacaoId,
    );
  }

  public async createPartner(
    actor: Actor,
    data: {
      nome: string;
      organizacaoId?: string;
      permissoes: string[];
      limiteRequisicoes: number;
      janelaLimiteSeg: number;
    },
  ) {
    if (actor.papel !== PapelUsuario.ADMINISTRADOR) {
      throw new ApiError(403, "Somente administradores podem gerenciar parceiros.", "FORBIDDEN");
    }
    if (!data.nome.trim()) {
      throw new ApiError(400, "Nome do parceiro e obrigatorio.", "INVALID_INPUT");
    }
    if (!Number.isInteger(data.limiteRequisicoes) || data.limiteRequisicoes < 1 ||
        !Number.isInteger(data.janelaLimiteSeg) || data.janelaLimiteSeg < 1) {
      throw new ApiError(400, "Limites de requisicoes invalidos.", "INVALID_INPUT");
    }
    const partner = await this.repository.createPartner({
      nome: data.nome.trim(),
      ...(data.organizacaoId ? { organizacaoId: data.organizacaoId } : {}),
      permissoes: [...new Set(data.permissoes)],
      limiteRequisicoes: data.limiteRequisicoes,
      janelaLimiteSeg: data.janelaLimiteSeg,
    });
    const secret = `gc_${randomBytes(32).toString("hex")}`;
    const key = await this.repository.generatePartnerKey(
      partner.id,
      createHash("sha256").update(secret).digest("hex"),
      secret.slice(0, 11),
    );
    return {
      parceiro: partner,
      chaveApi: secret,
      chaveId: key.id,
      aviso: "A chave e exibida uma unica vez; armazene-a de forma segura.",
    };
  }

  public async authenticatePartner(apiKey: string) {
    if (!/^gc_[0-9a-f]{64}$/.test(apiKey)) {
      throw new ApiError(401, "Chave de API invalida.", "INVALID_API_KEY");
    }
    const hash = createHash("sha256").update(apiKey).digest("hex");
    const key = await this.repository.findApiKey(hash);
    if (!key) {
      throw new ApiError(401, "Chave de API invalida ou revogada.", "INVALID_API_KEY");
    }
    await this.repository.touchApiKey(key.id);
    return key.parceiro;
  }

  public async revokePartnerKey(actor: Actor, keyId: string) {
    if (actor.papel !== PapelUsuario.ADMINISTRADOR) {
      throw new ApiError(403, "Somente administradores podem revogar chaves.", "FORBIDDEN");
    }
    await this.repository.revokeApiKey(keyId);
  }

  public async createReportTask(
    partner: { id: string; organizacaoId: string | null },
    categoria: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "VIDA_UTIL",
    formato: "JSON" | "CSV",
    dataInicio?: Date,
    dataFim?: Date,
  ) {
    if (dataInicio && dataFim && dataInicio > dataFim) {
      throw new ApiError(400, "Periodo de consulta invalido.", "INVALID_PERIOD");
    }
    return this.repository.createReportTask({
      parceiroId: partner.id,
      ...(partner.organizacaoId ? { organizacaoId: partner.organizacaoId } : {}),
      categoria,
      formato,
      dadosEntrada: {
        ...(dataInicio ? { dataInicio: dataInicio.toISOString() } : {}),
        ...(dataFim ? { dataFim: dataFim.toISOString() } : {}),
      },
    });
  }

  public async getReportTask(partnerId: string, taskId: string) {
    const task = await this.repository.findReportTask(taskId);
    if (!task) {
      throw new ApiError(404, "Tarefa nao encontrada.", "NOT_FOUND");
    }
    if (task.parceiroId !== partnerId) {
      throw new ApiError(404, "Tarefa nao encontrada para este parceiro.", "NOT_FOUND");
    }
    return task;
  }

  public async failReportTask(taskId: string, reason: string) {
    return this.repository.updateReportTask(taskId, {
      status: "FALHOU",
      ultimaFalha: reason,
    });
  }

  public exigirPermissaoParceiro(partner: { permissoes: unknown }, permission: string) {
    const permissoes = Array.isArray(partner.permissoes)
      ? partner.permissoes.map((item) => String(item))
      : [];
    if (!permissoes.includes(permission)) {
      throw new ApiError(403, "Chave nao possui permissao para esta operacao.", "FORBIDDEN");
    }
  }

  public async reportByStatus(actor: Actor, status: StatusRastreamento) {
    exigirPermissao(actor.papel, Permissao.GERAR_RELATORIOS, this.controlePermissoes);
    return this.repository.listEquipment(status);
  }

  public generateBarcode(actor: Actor, tipo: TipoEquipamento, sequencia: number): string {
    exigirPermissao(actor.papel, Permissao.ALOCAR_CODIGO_BARRAS, this.controlePermissoes);
    return `${tipo}-${String(sequencia).padStart(8, "0")}`;
  }

  public async financialReport(actor: Actor, inicio: Date, fim: Date) {
    exigirPermissao(actor.papel, Permissao.GERAR_RELATORIOS, this.controlePermissoes);
    if (inicio > fim) {
      throw new ApiError(400, "Periodo de consulta invalido.", "INVALID_PERIOD");
    }
    return this.repository.financialReport(inicio, fim);
  }

  public async getParameters(actor: Actor) {
    exigirPermissao(actor.papel, Permissao.CONFIGURAR_PARAMETROS_GLOBAIS, this.controlePermissoes);
    return this.repository.getParameters();
  }

  public async updateParameters(
    actor: Actor,
    data: { version: number; aliquotasImpostos?: Record<string, number>; coeficienteDepreciacao?: number },
  ) {
    exigirPermissao(actor.papel, Permissao.CONFIGURAR_PARAMETROS_GLOBAIS, this.controlePermissoes);
    if (data.aliquotasImpostos) {
      for (const [name, value] of Object.entries(data.aliquotasImpostos)) {
        validarFracao(`Aliquota de ${name}`, value);
      }
    }
    if (data.coeficienteDepreciacao !== undefined) {
      validarFracao("Coeficiente de depreciacao", data.coeficienteDepreciacao);
    }
    if (data.aliquotasImpostos === undefined && data.coeficienteDepreciacao === undefined) {
      throw new ApiError(400, "Informe ao menos um parametro para atualizar.", "INVALID_INPUT");
    }
    const patch = {
      ...(data.aliquotasImpostos === undefined ? {} : { aliquotasImpostos: data.aliquotasImpostos }),
      ...(data.coeficienteDepreciacao === undefined
        ? {}
        : { coeficienteDepreciacao: data.coeficienteDepreciacao }),
    };
    return this.repository.updateParameters(data.version, patch);
  }

  private async getOrganizationForVersion(id: string, version: number) {
    const organization = await this.repository.findOrganization(id);
    if (!organization) {
      throw new ApiError(404, "Organizacao nao encontrada.", "NOT_FOUND");
    }
    if (organization.version !== version) {
      throw conflitoVersao();
    }
    return organization;
  }
}

export interface Actor {
  id: string;
  usuario: string;
  papel: PapelUsuario;
}

interface EquipamentoEntrada {
  id?: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico?: EstadoFisico;
  pesoQuilogramas: number;
  valorEstimadoRecuperacao?: number;
  valorRecuperacaoReal?: number;
}

function exigirPermissao(
  papel: PapelUsuario,
  permissao: Permissao,
  controle: ControlePermissoes,
): void {
  if (!controle.temPermissao(papel, permissao)) {
    throw new ApiError(403, `Papel ${papel} nao possui permissao para esta operacao.`, "FORBIDDEN");
  }
}

function exigirConsultaOrganizacao(
  papel: PapelUsuario,
  controle: ControlePermissoes,
): void {
  if (
    !controle.temPermissao(papel, Permissao.CONSULTAR_HISTORICOS) &&
    !controle.temPermissao(papel, Permissao.CADASTRAR_ORGANIZACAO)
  ) {
    throw new ApiError(403, "Papel nao possui permissao para consultar organizacoes.", "FORBIDDEN");
  }
}

function validarNovoEquipamento(
  equipment: {
    codigoBarrasInterno: string;
    anoFabricacao: number;
    pesoQuilogramas: number;
  },
): void {
  if (!equipment.codigoBarrasInterno.trim()) {
    throw new ApiError(400, "Codigo de barras interno e obrigatorio.", "INVALID_EQUIPMENT");
  }
  if (!Number.isInteger(equipment.anoFabricacao) || equipment.anoFabricacao < 1) {
    throw new ApiError(400, "Ano de fabricacao invalido.", "INVALID_EQUIPMENT");
  }
  if (!Number.isFinite(equipment.pesoQuilogramas) || equipment.pesoQuilogramas < 0) {
    throw new ApiError(400, "Peso do equipamento invalido.", "INVALID_EQUIPMENT");
  }
}

function normalizarEquipamentos(equipamentos: EquipamentoEntrada[]): NovoEquipamento[] {
  return equipamentos.map(normalizarEquipamento);
}

function normalizarEquipamento(equipment: EquipamentoEntrada): NovoEquipamento {
  validarNovoEquipamento(equipment);
  return {
    id: equipment.id?.trim() || randomUUID(),
    codigoBarrasInterno: equipment.codigoBarrasInterno,
    tipo: equipment.tipo,
    marca: equipment.marca,
    modelo: equipment.modelo,
    anoFabricacao: equipment.anoFabricacao,
    estadoFisico: equipment.estadoFisico ?? EstadoFisico.NOVO,
    pesoQuilogramas: equipment.pesoQuilogramas,
    ...(equipment.valorEstimadoRecuperacao === undefined
      ? {}
      : { valorEstimadoRecuperacao: equipment.valorEstimadoRecuperacao }),
    ...(equipment.valorRecuperacaoReal === undefined
      ? {}
      : { valorRecuperacaoReal: equipment.valorRecuperacaoReal }),
  };
}

function validarFracao(nome: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ApiError(400, `${nome} deve estar entre 0 e 1.`, "INVALID_FRACTION");
  }
}

function validarPapel(value: string): PapelUsuario {
  return validarValorEnum(
    value,
    Object.values(PapelUsuario),
    "Papel de usuario persistido invalido.",
    "INVALID_STORED_ROLE",
  );
}

function validarValorEnum<T extends string>(
  value: string,
  valoresValidos: readonly T[],
  mensagem: string,
  codigo: string,
): T {
  const valor = valoresValidos.find((candidate) => candidate === value);
  if (valor === undefined) {
    throw new ApiError(500, mensagem, codigo);
  }
  return valor;
}

function conflitoVersao(): ApiError {
  return new ApiError(
    409,
    "O recurso foi alterado por outra requisicao. Recarregue os dados e tente novamente.",
    "VERSION_CONFLICT",
  );
}
