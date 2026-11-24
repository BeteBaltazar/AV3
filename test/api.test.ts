import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PapelUsuario as PapelUsuarioDb,
  StatusLote as StatusLoteDb,
  type Contrato as ContractDb,
  type Equipamento as EquipamentoDb,
  type Organizacao as OrganizationDb,
  type Prisma,
  type Usuario,
  type TarefaRelatorio,
} from "@prisma/client";
import { EstadoFisico } from "../src/domain/enums/EstadoFisico.js";
import { PapelUsuario } from "../src/domain/enums/PapelUsuario.js";
import { StatusRastreamento } from "../src/domain/enums/StatusRastreamento.js";
import { TipoEquipamento } from "../src/domain/enums/TipoEquipamento.js";
import { createApiApp } from "../src/api/app.js";
import { ApiError } from "../src/api/errors.js";
import type {
  ApiRepository,
  LoteComEquipamentos,
  EquipamentoRastreavel,
  NovaOrganizacao,
  NovoContrato,
  NovoLote,
  NovoUsuario,
  UsuarioPublico,
} from "../src/api/repositories/ApiRepository.js";
import { hashPassword } from "../src/api/passwords.js";
import { GreencodeApiService } from "../src/api/services/GreencodeApiService.js";
import {
  analisarEficiencia,
  analisarRentabilidade,
  analisarVidaUtil,
} from "../src/analysis/Analises.js";

test("analises estatisticas calculam eficiencia, rentabilidade e vida util", () => {
  const entrada = new Date("2026-01-01T08:00:00.000Z");
  const triagem = new Date("2026-01-01T10:00:00.000Z");
  const eficiencia = analisarEficiencia([{
    id: "lot-1",
    dataEntrada: entrada,
    statusProcessamento: "TRIAGEM_CONCLUIDA",
    equipamentos: [{
      id: "eq-1",
      tipo: "NOTEBOOK",
      marca: "Marca",
      modelo: "Modelo",
      anoFabricacao: 2024,
      estadoFisico: "BOM_ESTADO",
      pesoQuilogramas: 2,
      valorEstimadoRecuperacao: 100,
      valorRecuperacaoReal: null,
      historicoMovimentacao: [{
        dataHora: triagem,
        destino: "TRIAGEM",
        responsavel: "operador",
      }],
    }],
  }]);
  assert.equal(eficiencia.mediaHoras, 2);
  assert.equal(eficiencia.porOperador[0]?.operador, "operador");

  const rentabilidade = analisarRentabilidade([{
    id: "eq-1",
    tipo: "NOTEBOOK",
    marca: "Marca",
    modelo: "Modelo",
    anoFabricacao: 2024,
    estadoFisico: "BOM_ESTADO",
    pesoQuilogramas: 2,
    valorEstimadoRecuperacao: 100,
    valorRecuperacaoReal: 120,
    historicoEstados: [],
  }]);
  assert.equal(rentabilidade.porTipo[0]?.mediaValor, 120);
  assert.equal(rentabilidade.valorDisponivelCount, 1);

  const vidaUtil = analisarVidaUtil([{
    id: "eq-1",
    tipo: "NOTEBOOK",
    marca: "Marca",
    modelo: "Modelo",
    anoFabricacao: 2024,
    estadoFisico: "INSERVIVEL",
    pesoQuilogramas: 2,
    valorEstimadoRecuperacao: null,
    valorRecuperacaoReal: null,
    historicoEstados: [
      { dataHora: new Date("2026-01-01T00:00:00.000Z"), estadoFisico: "NOVO" },
      { dataHora: new Date("2026-07-01T00:00:00.000Z"), estadoFisico: "INSERVIVEL" },
    ],
  }]);
  assert.equal(vidaUtil.previsoes[0]?.estimativaDisponivel, true);
});

test("API exige JWT, autentica e aplica o papel atual do usuario", async (context) => {
  const password = await hashPassword("senha-correta-para-testes");
  const repository = new FakeApiRepository({
    id: "test-user-id",
    usuario: "operador",
    ...password,
    papel: PapelUsuarioDb.ADMINISTRADOR,
    ultimoAcesso: null,
    version: 1,
  });
  const app = await createApiApp(repository, {
    jwtSecret: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    jwtExpiresIn: "30m",
    logger: false,
  });
  context.after(async () => app.close());

  const noToken = await app.inject({ method: "GET", url: "/usuarios" });
  assert.equal(noToken.statusCode, 401);

  const invalidLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { usuario: "operador", senha: "senha-errada" },
  });
  assert.equal(invalidLogin.statusCode, 401);
  assert.deepEqual(invalidLogin.json(), {
    error: { code: "INVALID_CREDENTIALS", message: "Usuario ou senha invalidos." },
  });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { usuario: "operador", senha: "senha-correta-para-testes" },
  });
  assert.equal(login.statusCode, 200);
  const token = login.json<{ accessToken: string }>().accessToken;

  const allowed = await app.inject({
    method: "GET",
    url: "/usuarios",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(allowed.statusCode, 200);

  const individualUser = await app.inject({
    method: "GET",
    url: "/usuarios/test-user-id",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(individualUser.statusCode, 200);
  assert.deepEqual(individualUser.json(), {
    id: "test-user-id",
    usuario: "operador",
    papel: "ADMINISTRADOR",
    version: 2,
  });
  assert.equal(individualUser.json().senhaHash, undefined);
  assert.equal(individualUser.json().senhaSalt, undefined);

  const standaloneEquipment = await app.inject({
    method: "POST",
    url: "/equipamentos",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      codigoBarrasInterno: "BARCODE-AVULSO",
      tipo: "NOTEBOOK",
      marca: "Marca",
      modelo: "Modelo",
      anoFabricacao: 2020,
      pesoQuilogramas: 1.5,
    },
  });
  assert.equal(standaloneEquipment.statusCode, 201);
  assert.equal(standaloneEquipment.json().loteId, null);

  const equipmentDetails = await app.inject({
    method: "GET",
    url: `/equipamentos/${standaloneEquipment.json().id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(equipmentDetails.statusCode, 200);
  assert.equal(equipmentDetails.json().id, standaloneEquipment.json().id);
  assert.equal(equipmentDetails.json().historicoMovimentacao, undefined);

  repository.user = { ...repository.user, papel: PapelUsuarioDb.OPERADOR_CADASTRO };
  const staleRole = await app.inject({
    method: "GET",
    url: "/usuarios",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(staleRole.statusCode, 403);

  const invalidToken = await app.inject({
    method: "GET",
    url: "/usuarios",
    headers: { authorization: "Bearer invalid-token" },
  });
  assert.equal(invalidToken.statusCode, 401);

  const expiredToken = app.jwt.sign(
    { sub: "test-user-id", role: PapelUsuarioDb.ADMINISTRADOR },
    { expiresIn: -1 },
  );
  const expired = await app.inject({
    method: "GET",
    url: "/usuarios",
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expired.statusCode, 401);
});

test("API publica rejeita chave invalida e documentos incluem rotas publicas", async (context) => {
  const repository = new FakeApiRepository(null);
  const app = await createApiApp(repository, {
    jwtSecret: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    jwtExpiresIn: "30m",
    logger: false,
  });
  context.after(async () => app.close());

  const missingKey = await app.inject({
    method: "GET",
    url: "/api/v1/public/equipamentos/equipamento-1/rastreamento",
  });
  assert.equal(missingKey.statusCode, 401);

  const invalidKey = await app.inject({
    method: "GET",
    url: "/api/v1/public/equipamentos/equipamento-1/rastreamento",
    headers: { "x-api-key": "gc_invalida" },
  });
  assert.equal(invalidKey.statusCode, 401);

  const docs = await app.inject({ method: "GET", url: "/documentation/json" });
  const openApi = docs.json();
  assert.ok(openApi.paths["/api/v1/public/equipamentos/{id}/rastreamento"]);
  assert.ok(openApi.paths["/api/v1/public/lotes"].post);
  assert.ok(openApi.paths["/api/v1/admin/parceiros"].post);
  assert.ok(openApi.paths["/api/v1/public/tarefas"].post);
  assert.ok(openApi.paths["/api/v1/public/tarefas/{id}"].get);
  assert.ok(openApi.paths["/api/v1/public/tarefas/{id}/download"].get);
});

test("API publica aplica limite de requisicoes", async (context) => {
  const app = await createApiApp(new FakeApiRepository(null), {
    jwtSecret: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    jwtExpiresIn: "30m",
    logger: false,
  });
  context.after(async () => app.close());

  let exceeded = false;
  let lastStatus = 0;
  let lastBody = "";
  for (let index = 0; index < 101; index += 1) {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/public/equipamentos/equipamento-1/rastreamento",
      headers: { "x-api-key": "gc_invalida" },
    });
    lastStatus = response.statusCode;
    lastBody = response.body;
    if (response.statusCode === 429) {
      exceeded = true;
      break;
    }
  }
  assert.equal(lastStatus, 429, lastBody);
  assert.equal(exceeded, true);
});

test("API documenta rotas e rejeita corpos que nao atendem ao JSON Schema", async (context) => {
  const repository = new FakeApiRepository(null);
  const app = await createApiApp(repository, {
    jwtSecret: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    jwtExpiresIn: "30m",
    logger: false,
  });
  context.after(async () => app.close());

  const docs = await app.inject({ method: "GET", url: "/documentation/json" });
  assert.equal(docs.statusCode, 200);
  const openApi = docs.json();
  assert.ok(openApi.paths["/auth/login"]);
  assert.ok(openApi.paths["/lotes"]);
  assert.ok(openApi.paths["/lotes/{id}"].patch);
  assert.ok(openApi.paths["/organizacoes/{organizacaoId}/contratos"].get);
  assert.ok(openApi.paths["/contratos/{id}"].delete);
  assert.ok(openApi.paths["/contratos/{id}"].patch);
  assert.ok(openApi.paths["/equipamentos"].post);
  assert.ok(openApi.paths["/equipamentos/{id}"].get);
  assert.ok(openApi.paths["/usuarios/{id}"].get);
  assert.deepEqual(
    openApi.paths["/auth/login"].post.responses["200"].content["application/json"].schema
      .properties,
    {
      accessToken: { type: "string" },
      tokenType: { type: "string", enum: ["Bearer"] },
      expiresIn: { type: "string" },
    },
  );
  assert.equal(
    openApi.paths["/usuarios"].get.responses["200"].content["application/json"].schema.type,
    "array",
  );
  assert.ok(openApi.paths["/usuarios/{id}"].delete.responses["204"]);
  assert.equal(openApi.paths["/usuarios/{id}"].delete.responses["200"], undefined);
  assert.deepEqual(openApi.paths["/organizacoes"].get.security, [{ bearerAuth: [] }]);
  assert.ok(openApi.paths["/organizacoes"].get.responses["409"]);

  const invalidBody = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { usuario: "sem-senha" },
  });
  assert.equal(invalidBody.statusCode, 400);
});

test("consulta de tarefa bloqueia tarefa pertencente a outro parceiro", async () => {
  const repository = new FakeApiRepository(null);
  repository.reportTask = {
    id: "task-1",
    parceiroId: "partner-a",
    organizacaoId: "org-a",
    categoria: "RENTABILIDADE",
    formato: "JSON",
    status: "CONCLUIDA",
    tentativas: 1,
    tentativasMax: 3,
    dadosEntrada: {},
    arquivoUrl: "/api/v1/public/tarefas/task-1/download",
    ultimaFalha: null,
    criadoEm: new Date(),
    iniciadoEm: new Date(),
    concluidoEm: new Date(),
  };
  const service = new GreencodeApiService(repository);
  await assert.rejects(
    service.getReportTask("partner-b", "task-1"),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );
  const ownTask = await service.getReportTask("partner-a", "task-1");
  assert.equal(ownTask.id, "task-1");
});

test("servico rejeita atualizacao com versao obsoleta", async () => {
  const repository = new FakeApiRepository(null);
  repository.equipment = {
    id: "equipment-id",
    codigoBarrasInterno: "BARCODE-1",
    tipo: TipoEquipamento.NOTEBOOK,
    marca: "Marca",
    modelo: "Modelo",
    anoFabricacao: 2020,
    estadoFisico: EstadoFisico.NOVO,
    pesoQuilogramas: 1,
    loteId: "lot-id",
    posicaoNoLote: 1,
    statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
    version: 2,
  };
  const service = new GreencodeApiService(repository);

  await assert.rejects(
    service.updatePhysicalState(
      { id: "admin-id", usuario: "admin", papel: PapelUsuario.ADMINISTRADOR },
      "equipment-id",
      { version: 1, estadoFisico: EstadoFisico.BOM_ESTADO },
    ),
    (error: unknown) => error instanceof ApiError && error.statusCode === 409,
  );
});

test("servico lista e atualiza contratos e permite editar campos do lote", async () => {
  const repository = new FakeApiRepository(null);
  repository.organization = {
    id: "organization-id",
    razaoSocial: "Organizacao",
    cnpj: "00000000000000",
    cnpjNormalizado: "00000000000000",
    inscricaoEstadual: "ISENTO",
    enderecoCompleto: "Rua",
    telefone: "11999999999",
    email: "contato@example.com",
    dataCadastro: new Date("2025-01-01T00:00:00.000Z"),
    ativo: true,
    contratoVigente: true,
    version: 1,
  };
  repository.contract = {
    id: "contract-id",
    organizacaoId: "organization-id",
    dataAssinatura: new Date("2025-01-01T00:00:00.000Z"),
    dataVencimento: new Date("2027-01-01T00:00:00.000Z"),
    clausulas: "Clausulas originais",
    valorMensal: 100,
    renovacaoAutomatica: false,
    version: 1,
  };
  repository.lot = {
    id: "lot-id",
    dataEntrada: new Date("2025-01-01T00:00:00.000Z"),
    organizacaoId: "organization-id",
    notaFiscal: "NF-1",
    transportadora: "Transportadora 1",
    statusProcessamento: StatusLoteDb.RECEBIDO,
    observacoes: "",
    version: 1,
    equipamentos: [],
  };
  const service = new GreencodeApiService(repository);
  const admin = { id: "admin-id", usuario: "admin", papel: PapelUsuario.ADMINISTRADOR };

  const contracts = await service.listContractsByOrganization(admin, "organization-id");
  assert.equal(contracts.length, 1);
  const updatedContract = await service.updateContract(admin, "contract-id", {
    version: 1,
    clausulas: "Clausulas atualizadas",
    valorMensal: 250,
  });
  assert.equal(updatedContract.clausulas, "Clausulas atualizadas");
  assert.equal(updatedContract.valorMensal, 250);
  assert.equal(updatedContract.version, 2);

  const updatedLot = await service.updateLot(admin, "lot-id", {
    version: 1,
    notaFiscal: "NF-2",
    transportadora: "Transportadora 2",
    observacoes: "Revisado",
  });
  assert.equal(updatedLot.notaFiscal, "NF-2");
  assert.equal(updatedLot.transportadora, "Transportadora 2");
  assert.equal(updatedLot.observacoes, "Revisado");

  await service.deleteContract(admin, "contract-id", 2);
  assert.equal(repository.contract, null);
});

class FakeApiRepository implements ApiRepository {
  public equipment: EquipamentoDb | null = null;
  public organization: OrganizationDb | null = null;
  public contract: ContractDb | null = null;
  public lot: LoteComEquipamentos | null = null;
  public reportTask: TarefaRelatorio | null = null;

  public constructor(public user: Usuario | null) {}

  public async findUserByUsername(usuario: string) {
    return this.user?.usuario === usuario ? this.user : null;
  }

  public async findUserById(id: string) {
    return this.user?.id === id ? this.user : null;
  }

  public async listUsers(): Promise<UsuarioPublico[]> {
    return [];
  }

  public async createUser(_data: NovoUsuario): Promise<Usuario> {
    return this.unavailable();
  }

  public async updateUser(
    id: string,
    _expectedVersion: number,
    data: Prisma.UsuarioUpdateInput,
  ): Promise<Usuario> {
    if (!this.user || this.user.id !== id) {
      throw new Error("usuario de teste inexistente");
    }
    this.user = {
      ...this.user,
      ...(typeof data.senhaHash === "string" ? { senhaHash: data.senhaHash } : {}),
      ...(typeof data.senhaSalt === "string" ? { senhaSalt: data.senhaSalt } : {}),
      ...(typeof data.hashScheme === "string" ? { hashScheme: data.hashScheme } : {}),
      ...(data.ultimoAcesso instanceof Date ? { ultimoAcesso: data.ultimoAcesso } : {}),
      version: this.user.version + 1,
    };
    return this.user;
  }

  public async deleteUser(_id: string, _expectedVersion: number): Promise<void> {
    return this.unavailable();
  }

  public async createOrganization(_data: NovaOrganizacao) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["createOrganization"]>>>();
  }

  public async findOrganization(_id: string) {
    return this.organization?.id === _id ? this.organization : null;
  }

  public async listOrganizations(_activeOnly: boolean) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["listOrganizations"]>>>();
  }

  public async deactivateOrganization(_id: string, _version: number) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["deactivateOrganization"]>>>();
  }

  public async deleteOrganization(_id: string, _version: number): Promise<void> {
    return this.unavailable();
  }

  public async listContractsByOrganization(_organizationId: string) {
    return this.contract?.organizacaoId === _organizationId ? [this.contract] : [];
  }

  public async updateContract(
    _id: string,
    _version: number,
    data: import("../src/api/repositories/ApiRepository.js").AtualizacaoContrato,
  ) {
    if (!this.contract || this.contract.id !== _id || this.contract.version !== _version) {
      throw new Error("contrato de teste inexistente ou desatualizado");
    }
    this.contract = { ...this.contract, ...data, version: this.contract.version + 1 };
    return this.contract;
  }

  public async deleteContract(_id: string, _version: number): Promise<void> {
    if (!this.contract || this.contract.id !== _id || this.contract.version !== _version) {
      throw new Error("contrato de teste inexistente ou desatualizado");
    }
    this.contract = null;
  }

  public async createContract(_data: NovoContrato) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["createContract"]>>>();
  }

  public async findContract(_id: string) {
    return this.contract?.id === _id ? this.contract : null;
  }

  public async renewContract(_id: string, _version: number, _date: Date) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["renewContract"]>>>();
  }

  public async createLotWithEquipment(_data: NovoLote): Promise<LoteComEquipamentos> {
    return this.unavailable();
  }

  public async addEquipmentToLot(
    _lotId: string,
    _version: number,
    _equipment: NovoLote["equipamentos"],
  ): Promise<LoteComEquipamentos> {
    return this.unavailable();
  }

  public async findLot(_id: string) {
    return this.lot?.id === _id ? this.lot : null;
  }

  public async listLots(_start?: Date, _end?: Date) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["listLots"]>>>();
  }

  public async updateLot(
    _id: string,
    _version: number,
    data: import("../src/api/repositories/ApiRepository.js").AtualizacaoLote,
  ) {
    if (!this.lot || this.lot.id !== _id || this.lot.version !== _version) {
      throw new Error("lote de teste inexistente ou desatualizado");
    }
    this.lot = { ...this.lot, ...data, version: this.lot.version + 1 };
    return this.lot;
  }

  public async deleteLot(_id: string, _version: number): Promise<void> {
    return this.unavailable();
  }

  public async triageLot(
    _id: string,
    _version: number,
    _equipmentVersions: Array<{ id: string; version: number }>,
    _responsavel: string,
  ) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["triageLot"]>>>();
  }

  public async findEquipment(id: string) {
    return this.equipment?.id === id ? this.equipment : null;
  }

  public async createEquipment(
    data: import("../src/api/repositories/ApiRepository.js").NovoEquipamento,
  ) {
    this.equipment = {
      ...data,
      valorEstimadoRecuperacao: data.valorEstimadoRecuperacao ?? null,
      valorRecuperacaoReal: data.valorRecuperacaoReal ?? null,
      loteId: null,
      posicaoNoLote: 0,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
      version: 1,
    };
    return this.equipment;
  }

  public async trackEquipment(_id: string): Promise<EquipamentoRastreavel | null> {
    return this.unavailable();
  }

  public async listEquipment(_status?: import("../src/domain/enums/StatusRastreamento.js").StatusRastreamento) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["listEquipment"]>>>();
  }

  public async unlinkEquipment(_id: string, _version: number) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["unlinkEquipment"]>>>();
  }

  public async deleteEquipment(_id: string, _version: number): Promise<void> {
    return this.unavailable();
  }

  public async updatePhysicalState(
    _id: string,
    _version: number,
    _state: import("../src/domain/enums/EstadoFisico.js").EstadoFisico,
  ) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["updatePhysicalState"]>>>();
  }

  public async moveToDismantle(_id: string, _version: number, _responsavel: string) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["moveToDismantle"]>>>();
  }

  public async getParameters() {
    return this.unavailable<Awaited<ReturnType<ApiRepository["getParameters"]>>>();
  }

  public async updateParameters(_version: number, _data: Prisma.ParametrosGlobaisUpdateInput) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["updateParameters"]>>>();
  }

  public async financialReport(_start: Date, _end: Date) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["financialReport"]>>>();
  }

  public async createMovement(_data: Prisma.MovimentacaoCreateInput) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["createMovement"]>>>();
  }

  public async createPartner(_data: import("../src/api/repositories/ApiRepository.js").NovoParceiro) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["createPartner"]>>>();
  }

  public async findApiKey(_chaveHash: string) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["findApiKey"]>>>();
  }

  public async touchApiKey(_id: string): Promise<void> {
    return this.unavailable();
  }

  public async revokeApiKey(_id: string): Promise<void> {
    return this.unavailable();
  }

  public async generatePartnerKey(
    _partnerId: string,
    _chaveHash: string,
    _prefixo: string,
  ) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["generatePartnerKey"]>>>();
  }

  public async createReportTask(_data: {
    parceiroId: string;
    organizacaoId?: string;
    categoria: string;
    formato: string;
    dadosEntrada: object;
  }) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["createReportTask"]>>>();
  }

  public async findReportTask(_id: string) {
    return this.reportTask?.id === _id ? this.reportTask : null;
  }

  public async updateReportTask(_id: string, _data: Prisma.TarefaRelatorioUpdateInput) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["updateReportTask"]>>>();
  }

  public async getAnalyticsData(_dataInicio?: Date, _dataFim?: Date, _organizacaoId?: string) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["getAnalyticsData"]>>>();
  }

  public async saveAnalysis(_data: {
    categoria: string;
    dataInicio?: Date;
    dataFim?: Date;
    metodo: string;
    dadosUtilizados: object;
    resultado: object;
    observacoes: string;
    parceiroId?: string;
    organizacaoId?: string;
  }) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["saveAnalysis"]>>>();
  }

  public async listAnalysisResults(_categoria?: string, _parceiroId?: string, _organizacaoId?: string) {
    return this.unavailable<Awaited<ReturnType<ApiRepository["listAnalysisResults"]>>>();
  }

  private unavailable<T>(): Promise<T> {
    return Promise.reject(new Error("operacao nao usada neste teste"));
  }
}
