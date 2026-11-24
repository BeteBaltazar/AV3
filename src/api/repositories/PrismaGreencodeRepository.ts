import { randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  StatusLote,
  StatusRastreamento,
  PapelUsuario,
} from "@prisma/client";
import { ApiError } from "../errors.js";
import type {
  ApiRepository,
  AtualizacaoContrato,
  AtualizacaoLote,
  LoteComEquipamentos,
  EquipamentoRastreavel,
  NovaOrganizacao,
  NovoEquipamento,
  NovoContrato,
  NovoLote,
  NovoUsuario,
  NovoParceiro,
} from "./ApiRepository.js";

export class PrismaGreencodeRepository implements ApiRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public findUserByUsername(usuario: string) {
    return this.prisma.usuario.findUnique({ where: { usuario } });
  }

  public findUserById(id: string) {
    return this.prisma.usuario.findUnique({ where: { id } });
  }

  public listUsers() {
    return this.prisma.usuario.findMany({
      orderBy: { usuario: "asc" },
      omit: { senhaHash: true, senhaSalt: true, hashScheme: true },
    });
  }

  public createUser(data: NovoUsuario) {
    return this.prisma.usuario.create({
      data: {
        ...data,
        usuario: data.usuario.trim(),
      },
    });
  }

  public updateUser(
    id: string,
    expectedVersion: number,
    data: Prisma.UsuarioUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.usuario.findUnique({ where: { id } });
      if (!current) {
        throw new ApiError(404, "Usuario nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(current.version, expectedVersion);
      if (
        current.papel === PapelUsuario.ADMINISTRADOR &&
        data.papel !== undefined &&
        data.papel !== PapelUsuario.ADMINISTRADOR
      ) {
        const admins = await tx.usuario.count({
          where: { papel: PapelUsuario.ADMINISTRADOR },
        });
        if (admins <= 1) {
          throw new ApiError(409, "Nao e possivel remover o ultimo administrador.", "LAST_ADMIN");
        }
      }
      const result = await tx.usuario.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      return tx.usuario.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  public deleteUser(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.usuario.findUnique({ where: { id } });
      if (!user) {
        throw new ApiError(404, "Usuario nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(user.version, expectedVersion);
      if (user.papel === PapelUsuario.ADMINISTRADOR) {
        const admins = await tx.usuario.count({
          where: { papel: PapelUsuario.ADMINISTRADOR },
        });
        if (admins <= 1) {
          throw new ApiError(409, "Nao e possivel excluir o ultimo administrador.", "LAST_ADMIN");
        }
      }
      const result = await tx.usuario.deleteMany({
        where: { id, version: expectedVersion },
      });
      exigirAtualizacao(result.count);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  public createOrganization(data: NovaOrganizacao) {
    return this.prisma.organizacao.create({ data });
  }

  public findOrganization(id: string) {
    return this.prisma.organizacao.findUnique({ where: { id } });
  }

  public listOrganizations(activeOnly: boolean) {
    return this.prisma.organizacao.findMany({
      ...(activeOnly ? { where: { ativo: true } } : {}),
      orderBy: { razaoSocial: "asc" },
    });
  }

  public deactivateOrganization(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.organizacao.updateMany({
        where: { id, version: expectedVersion },
        data: { ativo: false, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      return tx.organizacao.findUniqueOrThrow({ where: { id } });
    });
  }

  public deleteOrganization(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organizacao.findUnique({ where: { id } });
      if (!organization) {
        throw new ApiError(404, "Organizacao nao encontrada.", "NOT_FOUND");
      }
      exigirVersao(organization.version, expectedVersion);
      if (organization.ativo) {
        throw new ApiError(409, "Desative a organizacao antes de apaga-la.", "ACTIVE_ORGANIZATION");
      }
      const lots = await tx.lote.count({ where: { organizacaoId: id } });
      if (lots > 0) {
        throw new ApiError(409, "Nao e possivel apagar organizacao com lotes vinculados.", "RELATED_LOTS");
      }
      await tx.contrato.deleteMany({ where: { organizacaoId: id } });
      const result = await tx.organizacao.deleteMany({
        where: { id, version: expectedVersion },
      });
      exigirAtualizacao(result.count);
    });
  }

  public createContract(data: NovoContrato) {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organizacao.findUnique({
        where: { id: data.organizacaoId },
      });
      if (!organization) {
        throw new ApiError(404, "Organizacao nao encontrada.", "NOT_FOUND");
      }
      if (await tx.contrato.findUnique({ where: { organizacaoId: data.organizacaoId } })) {
        throw new ApiError(409, "Organizacao ja possui contrato cadastrado.", "CONTRACT_EXISTS");
      }
      const contract = await tx.contrato.create({ data });
      const organizationUpdate = await tx.organizacao.updateMany({
        where: { id: organization.id, version: organization.version },
        data: {
          contratoVigente: data.dataVencimento.getTime() >= Date.now(),
          version: { increment: 1 },
        },
      });
      exigirAtualizacao(organizationUpdate.count);
      return contract;
    });
  }

  public findContract(id: string) {
    return this.prisma.contrato.findUnique({ where: { id } });
  }

  public listContractsByOrganization(organizationId: string) {
    return this.prisma.contrato.findMany({
      where: { organizacaoId: organizationId },
      orderBy: { dataAssinatura: "desc" },
    });
  }

  public updateContract(
    id: string,
    expectedVersion: number,
    data: AtualizacaoContrato,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contrato.findUnique({ where: { id } });
      if (!contract) {
        throw new ApiError(404, "Contrato nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(contract.version, expectedVersion);
      const result = await tx.contrato.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      if (data.dataVencimento !== undefined) {
        const organization = await tx.organizacao.findUnique({
          where: { id: contract.organizacaoId },
        });
        if (!organization) {
          throw new ApiError(409, "Organizacao do contrato nao encontrada.", "BROKEN_REFERENCE");
        }
        const organizationUpdate = await tx.organizacao.updateMany({
          where: { id: organization.id, version: organization.version },
          data: {
            contratoVigente: data.dataVencimento.getTime() >= Date.now(),
            version: { increment: 1 },
          },
        });
        exigirAtualizacao(organizationUpdate.count);
      }
      return tx.contrato.findUniqueOrThrow({ where: { id } });
    });
  }

  public deleteContract(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contrato.findUnique({ where: { id } });
      if (!contract) {
        throw new ApiError(404, "Contrato nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(contract.version, expectedVersion);
      const result = await tx.contrato.deleteMany({
        where: { id, version: expectedVersion },
      });
      exigirAtualizacao(result.count);
      const organization = await tx.organizacao.findUnique({
        where: { id: contract.organizacaoId },
      });
      if (!organization) {
        throw new ApiError(409, "Organizacao do contrato nao encontrada.", "BROKEN_REFERENCE");
      }
      const organizationUpdate = await tx.organizacao.updateMany({
        where: { id: organization.id, version: organization.version },
        data: { contratoVigente: false, version: { increment: 1 } },
      });
      exigirAtualizacao(organizationUpdate.count);
    });
  }

  public renewContract(id: string, expectedVersion: number, dataVencimento: Date) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contrato.findUnique({ where: { id } });
      if (!contract) {
        throw new ApiError(404, "Contrato nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(contract.version, expectedVersion);
      const result = await tx.contrato.updateMany({
        where: { id, version: expectedVersion },
        data: { dataVencimento, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      const organization = await tx.organizacao.findUnique({
        where: { id: contract.organizacaoId },
      });
      if (!organization) {
        throw new ApiError(409, "Organizacao do contrato nao encontrada.", "BROKEN_REFERENCE");
      }
      const organizationUpdate = await tx.organizacao.updateMany({
        where: { id: organization.id, version: organization.version },
        data: {
          contratoVigente: dataVencimento.getTime() >= Date.now(),
          version: { increment: 1 },
        },
      });
      exigirAtualizacao(organizationUpdate.count);
      return tx.contrato.findUniqueOrThrow({ where: { id } });
    });
  }

  public async createLotWithEquipment(data: NovoLote): Promise<LoteComEquipamentos> {
    return this.prisma.$transaction(async (tx) => {
      await tx.lote.create({
        data: {
          id: data.id,
          dataEntrada: data.dataEntrada,
          organizacaoId: data.organizacaoId,
          notaFiscal: data.notaFiscal,
          transportadora: data.transportadora,
          observacoes: data.observacoes,
        },
      });
      if (data.equipamentos.length > 0) {
        await tx.equipamento.createMany({
          data: data.equipamentos.map((equipment, index) => ({
            ...equipment,
            posicaoNoLote: index + 1,
            loteId: data.id,
          })),
        });
        const created = await tx.equipamento.findMany({
          where: { loteId: data.id },
          select: { id: true, estadoFisico: true },
        });
        await tx.historicoEstadoFisico.createMany({
          data: created.map((equipment) => ({
            equipamentoId: equipment.id,
            estadoFisico: equipment.estadoFisico,
          })),
        });
      }
      return tx.lote.findUniqueOrThrow({
        where: { id: data.id },
        include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
      });
    });
  }

  public async addEquipmentToLot(
    lotId: string,
    expectedVersion: number,
    equipamentos: NovoLote["equipamentos"],
  ): Promise<LoteComEquipamentos> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lote.findUnique({ where: { id: lotId } });
      if (!lot) {
        throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(lot.version, expectedVersion);
      const lotUpdate = await tx.lote.updateMany({
        where: { id: lotId, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      exigirAtualizacao(lotUpdate.count);
      const existing = await tx.equipamento.findMany({
        where: { loteId: lotId },
        select: { posicaoNoLote: true },
      });
      const firstPosition = existing.reduce(
        (maximum, equipment) => Math.max(maximum, equipment.posicaoNoLote),
        0,
      ) + 1;
      await tx.equipamento.createMany({
        data: equipamentos.map((equipment, index) => ({
          ...equipment,
          loteId: lotId,
          posicaoNoLote: firstPosition + index,
        })),
      });
      return tx.lote.findUniqueOrThrow({
        where: { id: lotId },
        include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
      });
    });
  }

  public findLot(id: string) {
    return this.prisma.lote.findUnique({
      where: { id },
      include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
    });
  }

  public listLots(dataInicio?: Date, dataFim?: Date): Promise<LoteComEquipamentos[]> {
    return this.prisma.lote.findMany({
      ...(dataInicio && dataFim
        ? { where: { dataEntrada: { gte: dataInicio, lte: dataFim } } }
        : {}),
      include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
      orderBy: { dataEntrada: "desc" },
    });
  }

  public updateLot(
    id: string,
    expectedVersion: number,
    data: AtualizacaoLote,
  ): Promise<LoteComEquipamentos> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lote.findUnique({ where: { id } });
      if (!lot) {
        throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(lot.version, expectedVersion);
      const result = await tx.lote.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      return tx.lote.findUniqueOrThrow({
        where: { id },
        include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
      });
    });
  }

  public deleteLot(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lote.findUnique({ where: { id } });
      if (!lot) {
        throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(lot.version, expectedVersion);
      if (await tx.equipamento.count({ where: { loteId: id } }) > 0) {
        throw new ApiError(409, "Nao e possivel excluir lote com equipamentos vinculados.", "RELATED_EQUIPMENT");
      }
      const result = await tx.lote.deleteMany({
        where: { id, version: expectedVersion },
      });
      exigirAtualizacao(result.count);
    });
  }

  public async triageLot(
    id: string,
    expectedVersion: number,
    equipmentVersions: Array<{ id: string; version: number }>,
    responsavel: string,
  ): Promise<LoteComEquipamentos> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lote.findUnique({ where: { id } });
      if (!lot) {
        throw new ApiError(404, "Lote nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(lot.version, expectedVersion);
      if (lot.statusProcessamento !== StatusLote.RECEBIDO) {
        throw new ApiError(409, "Somente lotes recebidos podem ser triados.", "INVALID_TRANSITION");
      }
      const lotUpdate = await tx.lote.updateMany({
        where: {
          id,
          version: expectedVersion,
          statusProcessamento: StatusLote.RECEBIDO,
        },
        data: {
          statusProcessamento: StatusLote.TRIAGEM_CONCLUIDA,
          version: { increment: 1 },
        },
      });
      exigirAtualizacao(lotUpdate.count);

      for (const item of equipmentVersions) {
        const equipment = await tx.equipamento.findUnique({
          where: { id: item.id },
          include: {
            historicoMovimentacao: { orderBy: { dataHora: "desc" }, take: 1 },
          },
        });
        if (
          !equipment ||
          equipment.loteId !== id ||
          equipment.version !== item.version ||
          equipment.statusRastreamento !== StatusRastreamento.AGUARDANDO_TRIAGEM
        ) {
          throw conflitoVersao();
        }
        const updated = await tx.equipamento.updateMany({
          where: {
            id: item.id,
            version: item.version,
            statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
          },
          data: {
            statusRastreamento: StatusRastreamento.AGUARDANDO_DESMONTE,
            version: { increment: 1 },
          },
        });
        exigirAtualizacao(updated.count);
        await tx.movimentacao.create({
          data: {
            equipamentoId: item.id,
            origem: equipment.historicoMovimentacao[0]?.destino ?? "ORIGEM",
            destino: "TRIAGEM",
            responsavel,
          },
        });
      }

      return tx.lote.findUniqueOrThrow({
        where: { id },
        include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
      });
    });
  }

  public findEquipment(id: string) {
    return this.prisma.equipamento.findUnique({ where: { id } });
  }

  public createEquipment(data: NovoEquipamento) {
    return this.prisma.$transaction(async (tx) => {
      const equipment = await tx.equipamento.create({ data });
      await tx.historicoEstadoFisico.create({
        data: {
          equipamentoId: equipment.id,
          estadoFisico: equipment.estadoFisico,
        },
      });
      return equipment;
    });
  }

  public trackEquipment(id: string) {
    return this.prisma.equipamento.findUnique({
      where: { id },
      include: {
        lote: { include: { organizacao: true } },
        historicoMovimentacao: { orderBy: { dataHora: "asc" } },
      },
    });
  }

  public listEquipment(status?: StatusRastreamento) {
    return this.prisma.equipamento.findMany({
      ...(status ? { where: { statusRastreamento: status } } : {}),
      orderBy: [{ loteId: "asc" }, { posicaoNoLote: "asc" }],
    });
  }

  public unlinkEquipment(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const equipment = await tx.equipamento.findUnique({ where: { id } });
      if (!equipment) {
        throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(equipment.version, expectedVersion);
      if (!equipment.loteId) {
        throw new ApiError(409, "Equipamento ja esta desvinculado de um lote.", "ALREADY_UNLINKED");
      }
      const lot = await tx.lote.findUnique({ where: { id: equipment.loteId } });
      if (!lot) {
        throw new ApiError(409, "Lote associado ao equipamento nao encontrado.", "BROKEN_REFERENCE");
      }
      const equipmentUpdate = await tx.equipamento.updateMany({
        where: { id, version: expectedVersion, loteId: lot.id },
        data: { loteId: null, posicaoNoLote: 0, version: { increment: 1 } },
      });
      exigirAtualizacao(equipmentUpdate.count);
      const lotUpdate = await tx.lote.updateMany({
        where: { id: lot.id, version: lot.version },
        data: { version: { increment: 1 } },
      });
      exigirAtualizacao(lotUpdate.count);

      const remaining = await tx.equipamento.findMany({
        where: { loteId: lot.id },
        orderBy: { posicaoNoLote: "asc" },
      });
      for (const [index, remainingEquipment] of remaining.entries()) {
        const position = index + 1;
        if (remainingEquipment.posicaoNoLote !== position) {
          await tx.equipamento.updateMany({
            where: { id: remainingEquipment.id, version: remainingEquipment.version },
            data: { posicaoNoLote: position, version: { increment: 1 } },
          }).then((result) => exigirAtualizacao(result.count));
        }
      }
      return tx.equipamento.findUniqueOrThrow({ where: { id } });
    });
  }

  public deleteEquipment(id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const equipment = await tx.equipamento.findUnique({ where: { id } });
      if (!equipment) {
        throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(equipment.version, expectedVersion);
      if (equipment.loteId) {
        throw new ApiError(409, "Desvincule o equipamento do lote antes de apaga-lo.", "EQUIPMENT_LINKED");
      }
      if (await tx.movimentacao.count({ where: { equipamentoId: id } }) > 0) {
        throw new ApiError(409, "Equipamentos com historico de movimentacoes nao podem ser apagados.", "MOVEMENT_HISTORY");
      }
      const result = await tx.equipamento.deleteMany({
        where: { id, version: expectedVersion },
      });
      exigirAtualizacao(result.count);
    });
  }

  public updatePhysicalState(
    id: string,
    expectedVersion: number,
    estadoFisico: import("../../domain/enums/EstadoFisico.js").EstadoFisico,
    justificativa = "",
    responsavel = "",
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.equipamento.updateMany({
        where: { id, version: expectedVersion },
        data: { estadoFisico, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      await tx.historicoEstadoFisico.create({
        data: {
          equipamentoId: id,
          estadoFisico,
          justificativa,
          responsavel,
        },
      });
      return tx.equipamento.findUniqueOrThrow({ where: { id } });
    });
  }

  public moveToDismantle(
    id: string,
    expectedVersion: number,
    responsavel: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const equipment = await tx.equipamento.findUnique({
        where: { id },
        include: {
          historicoMovimentacao: { orderBy: { dataHora: "desc" }, take: 1 },
        },
      });
      if (!equipment) {
        throw new ApiError(404, "Equipamento nao encontrado.", "NOT_FOUND");
      }
      exigirVersao(equipment.version, expectedVersion);
      const result = await tx.equipamento.updateMany({
        where: {
          id,
          version: expectedVersion,
          statusRastreamento: StatusRastreamento.AGUARDANDO_DESMONTE,
        },
        data: {
          statusRastreamento: StatusRastreamento.EM_DESMONTE,
          version: { increment: 1 },
        },
      });
      exigirAtualizacao(result.count);
      await tx.movimentacao.create({
        data: {
          equipamentoId: id,
          origem: equipment.historicoMovimentacao[0]?.destino ?? "ORIGEM",
          destino: "DESMONTE",
          responsavel,
        },
      });
      return tx.equipamento.findUniqueOrThrow({ where: { id } });
    });
  }

  public getParameters() {
    return this.prisma.parametrosGlobais.upsert({
      where: { id: "parametros-globais" },
      create: { id: "parametros-globais" },
      update: {},
    });
  }

  public updateParameters(
    expectedVersion: number,
    data: Prisma.ParametrosGlobaisUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.parametrosGlobais.upsert({
        where: { id: "parametros-globais" },
        create: { id: "parametros-globais" },
        update: {},
      });
      const result = await tx.parametrosGlobais.updateMany({
        where: { id: "parametros-globais", version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      exigirAtualizacao(result.count);
      return tx.parametrosGlobais.findUniqueOrThrow({
        where: { id: "parametros-globais" },
      });
    });
  }

  public financialReport(dataInicio: Date, dataFim: Date) {
    return this.prisma.contrato.findMany({
      where: { dataAssinatura: { gte: dataInicio, lte: dataFim } },
      orderBy: { dataAssinatura: "asc" },
    });
  }

  public async getAnalyticsData(dataInicio?: Date, dataFim?: Date, organizacaoId?: string) {
    const period = dataInicio && dataFim
      ? { gte: dataInicio, lte: dataFim }
      : undefined;
    const [lotes, equipamentos] = await Promise.all([
      this.prisma.lote.findMany({
        where: {
          ...(period ? { dataEntrada: period } : {}),
          ...(organizacaoId ? { organizacaoId } : {}),
        },
        include: {
          equipamentos: {
            include: { historicoMovimentacao: true },
          },
        },
        orderBy: { dataEntrada: "asc" },
      }),
      this.prisma.equipamento.findMany({
        ...(organizacaoId
          ? { where: { lote: { is: { organizacaoId } } } }
          : {}),
        include: { historicoEstados: { orderBy: { dataHora: "asc" } } },
        orderBy: { id: "asc" },
      }),
    ]);
    return { lotes, equipamentos };
  }

  public saveAnalysis(data: {
    categoria: string;
    tarefaId?: string;
    dataInicio?: Date;
    dataFim?: Date;
    metodo: string;
    dadosUtilizados: object;
    resultado: object;
    observacoes: string;
    parceiroId?: string;
    organizacaoId?: string;
  }) {
    const analysisData = {
      categoria: data.categoria,
      ...(data.tarefaId ? { tarefaId: data.tarefaId } : {}),
      ...(data.dataInicio ? { dataInicio: data.dataInicio } : {}),
      ...(data.dataFim ? { dataFim: data.dataFim } : {}),
      metodo: data.metodo,
      dadosUtilizados: data.dadosUtilizados as Prisma.JsonObject,
      resultado: data.resultado as Prisma.JsonObject,
      observacoes: data.observacoes,
      ...(data.parceiroId ? { parceiroId: data.parceiroId } : {}),
      ...(data.organizacaoId ? { organizacaoId: data.organizacaoId } : {}),
    };

    if (data.tarefaId) {
      return this.prisma.resultadoAnalise.upsert({
        where: { tarefaId: data.tarefaId },
        create: analysisData,
        update: analysisData,
      });
    }

    return this.prisma.resultadoAnalise.create({ data: analysisData });
  }

  public listAnalysisResults(categoria?: string, parceiroId?: string, organizacaoId?: string) {
    return this.prisma.resultadoAnalise.findMany({
      where: {
        ...(categoria ? { categoria } : {}),
        ...(parceiroId ? { parceiroId } : {}),
        ...(organizacaoId ? { organizacaoId } : {}),
      },
      orderBy: { realizadoEm: "desc" },
    });
  }

  public createMovement(data: Prisma.MovimentacaoCreateInput) {
    return this.prisma.movimentacao.create({ data });
  }

  public createPartner(data: NovoParceiro) {
    return this.prisma.parceiro.create({
      data: {
        nome: data.nome,
        ...(data.organizacaoId ? { organizacaoId: data.organizacaoId } : {}),
        permissoes: data.permissoes,
        limiteRequisicoes: data.limiteRequisicoes,
        janelaLimiteSeg: data.janelaLimiteSeg,
      },
    });
  }

  public findApiKey(chaveHash: string) {
    return this.prisma.chaveApi.findFirst({
      where: { chaveHash, ativa: true, parceiro: { ativo: true } },
      include: { parceiro: true },
    });
  }

  public async touchApiKey(id: string) {
    await this.prisma.chaveApi.update({
      where: { id },
      data: { ultimoUso: new Date() },
    });
  }

  public async revokeApiKey(id: string) {
    await this.prisma.chaveApi.update({
      where: { id },
      data: { ativa: false, revogadaEm: new Date() },
    });
  }

  public generatePartnerKey(partnerId: string, chaveHash: string, prefixo: string) {
    return this.prisma.chaveApi.create({
      data: { parceiroId: partnerId, chaveHash, prefixo },
    });
  }

  public createReportTask(data: {
    parceiroId: string;
    organizacaoId?: string;
    categoria: string;
    formato: string;
    dadosEntrada: object;
  }) {
    return this.prisma.tarefaRelatorio.create({
      data: {
        parceiroId: data.parceiroId,
        ...(data.organizacaoId ? { organizacaoId: data.organizacaoId } : {}),
        categoria: data.categoria,
        formato: data.formato,
        status: "AGUARDANDO_PROCESSAMENTO",
        dadosEntrada: data.dadosEntrada as Prisma.JsonObject,
      },
    });
  }

  public findReportTask(id: string) {
    return this.prisma.tarefaRelatorio.findUnique({ where: { id } });
  }

  public updateReportTask(id: string, data: Prisma.TarefaRelatorioUpdateInput) {
    return this.prisma.tarefaRelatorio.update({ where: { id }, data });
  }
}

function exigirAtualizacao(rowsUpdated: number): void {
  if (rowsUpdated !== 1) {
    throw conflitoVersao();
  }
}

function exigirVersao(actualVersion: number, expectedVersion: number): void {
  if (actualVersion !== expectedVersion) {
    throw conflitoVersao();
  }
}

function conflitoVersao(): ApiError {
  return new ApiError(
    409,
    "O recurso foi alterado por outra requisicao. Recarregue os dados e tente novamente.",
    "VERSION_CONFLICT",
  );
}
