# greencode

Aplicacao Greencode em Node.js + TypeScript para operacao de uma plataforma de
logistica reversa de residuos e equipamentos eletronicos. Mantem a CLI original
e adiciona uma API REST monolitica com Fastify, PostgreSQL e Prisma, consumida
por uma aplicacao web SPA em React, TypeScript e Vite.

## Requisitos

- Node.js 20.19 ou superior
- npm
- Windows 10 ou superior, Ubuntu Linux 24.04.3 ou superior, ou distribuicao
  derivada do Ubuntu. A compatibilidade declarada deve ser interpretada conforme
  as plataformas efetivamente listadas na secao de compatibilidade abaixo.

## Instalar

```bash
npm install
```

## Validar o projeto

Na raiz, valide o backend e a CLI:

```bash
npm run check
npm test
npm run build
```

Para validar o front-end, consulte [frontend/README.md](frontend/README.md) e
execute `npm run lint` e `npm run build` dentro de `frontend`.

## Executar

Modo de desenvolvimento:

```bash
npm run dev
```

Modo compilado:

```bash
npm start
```

Na primeira execucao, o sistema solicita o usuario e a senha do primeiro administrador, gera a chave de criptografia e cria a configuracao mestre.

O diretorio de dados padrao e `.greencode`. Para usar outro diretorio:

```powershell
$env:GREENCODE_DATA_DIR = "D:\dados\greencode"
npm start
```

No Linux/macOS, use uma variável de ambiente e um caminho nativo da plataforma:

```bash
GREENCODE_DATA_DIR="$HOME/dados/greencode" npm start
```

## Aplicacao web (SPA)

O projeto tambem inclui uma interface web em `frontend/`, implementada com
React, TypeScript e Vite. Ela consome a API REST; nao acessa diretamente o
PostgreSQL. Para executar localmente, mantenha a API e o front-end em terminais
separados.

1. Configure PostgreSQL e as variaveis da API conforme a secao
   [API REST com PostgreSQL](#api-rest-com-postgresql). Aplique as migracoes e
   crie uma conta de desenvolvimento usando o seed ou importe os dados legados.
2. Na raiz do projeto, inicie a API:

   ```powershell
   npm run dev:api
   ```

3. Em outro terminal, instale as dependencias e inicie o Vite:

   ```powershell
   Set-Location frontend
   npm install
   npm run dev
   ```

4. Abra o endereco exibido pelo Vite (por padrao,
   `http://localhost:5173`). O servidor de desenvolvimento encaminha chamadas
   `/api/*` para `http://127.0.0.1:3000`, removendo o prefixo `/api`; por
   exemplo, `/api/health` chega ao endpoint `/health` da API. Esse proxy evita
   configurar CORS para o desenvolvimento local. A configuracao nao define um
   proxy ou hospedagem de producao.

O front-end inclui login, navegacao por papel e telas para usuarios,
organizacoes, contratos, lotes, equipamentos, rastreabilidade, relatorios e
parametros globais. A API continua sendo a autoridade para autenticacao e
permissoes; esconder uma opcao no menu nao substitui a validacao do servidor.
O token fica apenas em memoria na sessao da SPA e e removido ao sair, expirar
ou receber HTTP 401.

As instrucoes detalhadas sobre cliente HTTP, limitacoes das rotas, validacao e
tratamento de conflitos estao em [frontend/README.md](frontend/README.md).
Nunca inclua `JWT_SECRET`, `DATABASE_URL` ou credenciais do banco em codigo do
front-end ou variaveis `VITE_*`: valores `VITE_*` sao publicados no bundle.

## Comandos da CLI

Os argumentos podem ser posicionais ou nomeados. Exemplos:

```text
login <usuario> <senha>
login --usuario <usuario> --senha <senha>
usuario criar --usuario <usuario> --senha <senha> --papel <papel>
usuario listar
usuario editar --usuario <usuario> [--senha <nova-senha>] [--papel <papel>]
usuario excluir --usuario <usuario>
parametro listar
parametro configurar-aliquota --imposto <nome> --valor <fracao-0-a-1>
parametro configurar-depreciacao --coeficiente <fracao-0-a-1>
logout
menu
ajuda
sair
```

Somente o papel `ADMINISTRADOR` pode gerenciar contas. A edição aceita senha,
papel ou ambos; o sistema impede excluir a própria conta ou remover o último
administrador. A listagem não exibe hash nem salt. Os papéis aceitos são
`ADMINISTRADOR`, `OPERADOR_CADASTRO`, `GESTOR_ALMOXARIFADO` e `AUDITOR`.

### Parametros globais

Somente `ADMINISTRADOR` pode consultar e configurar os parametros globais.
Alíquotas são cadastradas pelo nome informado e os valores devem ser frações
entre `0` e `1` (por exemplo, `0.18` representa 18%). O coeficiente de
depreciação também usa uma fração entre `0` e `1`; enquanto não for alterado,
permanece em `0.08`. Os parâmetros são persistidos cifrados em
`dados/parametros-globais.json`.

```text
parametro listar
parametro configurar-aliquota --imposto ICMS --valor 0.18
parametro configurar-depreciacao --coeficiente 0.10
equipamento depreciacao --id <id>
```

### Organizacoes

```text
organizacao cadastrar --id <id> --razaoSocial <nome> --cnpj <cnpj> --inscricaoEstadual <ie> --endereco <endereco> --telefone <telefone> --email <email>
organizacao listar
organizacao buscar --id <id>
organizacao desativar --id <id>
organizacao apagar --id <id>
```

### Contratos

Somente `ADMINISTRADOR` e `OPERADOR_CADASTRO` podem criar contratos. O ID é
gerado automaticamente se `--id` não for informado. As cláusulas podem conter
espaços e terminam no próximo argumento nomeado.

```text
contrato criar --org <id-organizacao> --dataAssinatura <ISO> --dataVencimento <ISO> --clausulas <texto> --valorMensal <numero> --renovacaoAutomatica <true|false>
```

### Lotes

```text
lote criar --id <id> --dataEntrada <ISO> --org <id> --nf <nota> --transp <nome>
lote triar --id <id>
lote excluir --id <id>
```

### Equipamentos

`--peso` deve ser informado como numero, sem a unidade `kg`.

```text
equipamento cadastrar --id <id> --codigo <codigo> --tipo <tipo> --marca <marca> --modelo <modelo> --ano <ano> --peso <numero> --lote <id>
equipamento rastrear --id <id>
equipamento desmonte --id <id>
equipamento desvincular --id <id>
equipamento apagar --id <id>
```

### Relatorios e codigos

```text
lote consultar --inicio <ISO> --fim <ISO>
relatorio status --status <status>
codigo gerar --tipo <tipo> --sequencia <numero>
```

Status de rastreamento aceitos em `relatorio status`:

```text
AGUARDANDO_TRIAGEM
EM_TRIAGEM
AGUARDANDO_DESMONTE
EM_DESMONTE
PECAS_REAPROVEITADAS
MATERIAL_RECICLAVEL
DESCARTE_SEGURO
BAIXA_DEFINITIVA
```

### Mudanca de status

O comando abaixo processa a triagem do lote:

```text
lote triar --id <id-do-lote>
```

Depois desse comando:

- o lote passa de `RECEBIDO` para `TRIAGEM_CONCLUIDA`;
- os equipamentos do lote passam de `AGUARDANDO_TRIAGEM` para `AGUARDANDO_DESMONTE`.
- cada equipamento recebe uma movimentação de triagem no histórico, identificando o usuário responsável.

Depois da triagem, o comando abaixo movimenta o equipamento para `EM_DESMONTE` e registra a movimentação:

```text
equipamento desmonte --id <id-do-equipamento>
```

Para consultar os equipamentos que aguardam desmonte:

```text
relatorio status --status AGUARDANDO_DESMONTE
```

O comando `equipamento desmonte` exige que o equipamento esteja em `AGUARDANDO_DESMONTE`; tentar movimentá-lo antes da triagem gera erro.

```TESTE
login --usuario Gerson --senha 123

organizacao cadastrar --id 67 --razaoSocial tungtungsahur --cnpj 60.409.075/0001-52 --inscricaoEstadual 456 --endereco araraquara --telefone 40028922 --email email@email.com

lote criar --id 1 --dataEntrada 2026-09-01 --org 67 --nf 01 --transp transportingbet

equipamento cadastrar --id 21 --codigo 2121 --tipo NOTEBOOK --marca thinkpad --modelo 021 --ano 2021 --peso 420 --lote 1

lote triar --id 1

relatorio status --status AGUARDANDO_DESMONTE

equipamento rastrear --id 21

lote consultar --inicio 2026-09-01 --fim 2026-09-30

logout
```

As opcoes exibidas no menu dependem do papel autenticado. A permissao tambem e verificada pelos servicos.

## Estrutura

- `src/domain`: entidades, enums e validadores.
- `src/infrastructure`: arquivos, criptografia e provisionamento.
- `src/security`: credenciais, sessoes e permissoes.
- `src/services`: regras de aplicacao e operacoes de negocio.
- `src/audit`: journal cifrado e rotacao.
- `src/presentation`: CLI.
- `src/integration`: composicao das dependencias.
- `src/api`: API REST, autenticacao, OpenAPI e persistencia Prisma.
- `frontend`: SPA React/Vite que consome a API.
- `test`: testes automatizados.

## Documentacao de seguranca

Consulte [docs/ARQUITETURA-SEGURANCA.md](docs/ARQUITETURA-SEGURANCA.md).

## API REST com PostgreSQL

A CLI original continua disponivel pelos comandos `npm run dev` e `npm start`.
A API HTTP e um ponto de entrada separado e usa Node.js, TypeScript, Fastify,
Prisma ORM e PostgreSQL. O Fastify registra rotas e schemas, os servicos
`GreencodeApiService` aplicam as regras de negocio e o
`PrismaGreencodeRepository` centraliza a persistencia. O servidor pode ser
iniciado em desenvolvimento com `npm run dev:api` ou compilado com
`npm run build` e `npm run start:api`.

As dependencias principais sao:

- Fastify e plugins JWT, Swagger e Swagger UI para HTTP, autenticacao e OpenAPI.
- `@fastify/rate-limit` para limitar requisicoes publicas por chave API ou IP.
- `pg-boss` para filas persistidas no PostgreSQL e workers assíncronos de relatórios.
- Prisma Client e `@prisma/adapter-pg` para acesso tipado ao PostgreSQL.
- `pg` como driver PostgreSQL e `dotenv` para carregar configuracoes locais.
- TypeScript, `tsx` e Prisma CLI como ferramentas de compilacao e desenvolvimento.
- React, React DOM, Vite e o plugin React na aplicacao SPA; suas dependencias
  ficam isoladas em `frontend/package.json` e sao instaladas separadamente.

### Variaveis de ambiente

- Node.js 20.19 ou superior e PostgreSQL 16 ou superior.
- Copie `.env.example` para `.env`; o arquivo `.env` nao deve ser versionado.

| Variavel | Uso | Padrao/obrigatoriedade |
| --- | --- | --- |
| `DATABASE_URL` | URL PostgreSQL usada pela API, Prisma, migracoes e seed | Obrigatoria para API e seed |
| `JWT_SECRET` | Segredo de assinatura dos tokens JWT | Obrigatoria; ao menos 32 bytes |
| `JWT_EXPIRES_IN` | Prazo do token, em segundos, minutos, horas ou dias (por exemplo, `30m`) | `30m` |
| `PORT` | Porta HTTP da API | `3000` |
| `HOST` | Interface de rede onde a API escuta | `0.0.0.0` |
| `GREENCODE_ADMIN_USERNAME` | Usuario administrador criado pelo seed ou comando de primeiro administrador | Obrigatoria para esses comandos |
| `GREENCODE_ADMIN_PASSWORD` | Senha inicial do administrador | Obrigatoria para esses comandos, sem valor padrao |
| `GREENCODE_DATA_DIR` | Diretorio de dados cifrados da CLI e do importador legado | `.greencode` |
| `REPORT_OUTPUT_DIR` | Diretorio local dos arquivos JSON/CSV gerados pelo worker | `./reports` |
| `REPORT_WORKER_CONCURRENCY` | Consumidores PostgreSQL ativos em cada processo worker | `2` |

Use um segredo aleatorio e exclusivo para `JWT_SECRET`; nao use o valor
ilustrativo de `.env.example` em producao nem reutilize a senha do banco.
`GREENCODE_ADMIN_PASSWORD` deve ser configurada apenas no ambiente local para
o seed ou a criacao do primeiro administrador e nao deve ser adicionada ao
repositorio.

### API publica para parceiros

Os parceiros usam os caminhos abaixo, separados das rotas administrativas com
JWT:

```text
POST /api/v1/admin/parceiros
POST /api/v1/admin/chaves/:id/revogacao
GET  /api/v1/public/equipamentos/:id/rastreamento
POST /api/v1/public/lotes
GET  /api/v1/public/analises/resultados
POST /api/v1/public/analises/:categoria/executar
POST /api/v1/public/tarefas
GET  /api/v1/public/tarefas/:id
GET  /api/v1/public/tarefas/:id/download
```

Rotas administrativas exigem um JWT de `ADMINISTRADOR`. Rotas publicas exigem
o cabecalho `x-api-key`. A chave completa e exibida somente na criacao do
parceiro; o banco guarda apenas seu SHA-256, prefixo e estado de revogacao.

Permissoes reconhecidas:

```text
RASTREABILIDADE_LEITURA
LOTE_CONSULTAR
LOTE_CADASTRAR
ANALISE_CONSULTAR
ANALISE_EXECUTAR
```

As rotas publicas possuem limite padrao de 100 requisicoes por 60 segundos.
O excesso retorna HTTP 429. Em implantacoes com varias instancias, use um
limitador compartilhado no proxy ou configure um armazenamento compartilhado
para os contadores.

### Processamento assíncrono de relatórios

A fila `greencode-relatorios` e persistida no PostgreSQL por `pg-boss`; nao e
necessario instalar ou configurar Redis. Execute a API e o worker em processos
separados usando o mesmo `DATABASE_URL`:

```powershell
$env:REPORT_OUTPUT_DIR = ".\reports"
npm run dev:api
npm run dev:worker
```

`pg-boss` cria e gerencia seu proprio schema no PostgreSQL durante a inicializacao.
O usuario configurado em `DATABASE_URL` precisa ter permissao para criar esse
schema e suas tabelas. Aumente `REPORT_WORKER_CONCURRENCY` para iniciar mais
consumidores no processo worker; workers adicionais tambem podem compartilhar a
mesma fila.

Solicite um relatório público com:

```http
POST /api/v1/public/tarefas
x-api-key: gc_...
Content-Type: application/json

{
  "categoria": "RENTABILIDADE",
  "formato": "JSON",
  "dataInicio": "2026-01-01T00:00:00.000Z",
  "dataFim": "2026-12-31T23:59:59.000Z"
}
```

A resposta HTTP 202 contém `taskId`. Consulte
`GET /api/v1/public/tarefas/:taskId` e, após `CONCLUIDA`, baixe
`GET /api/v1/public/tarefas/:taskId/download`.

Política de retry: até 3 execuções por tarefa (a inicial e 2 retentativas), com
intervalo exponencial a partir de 5 segundos. Erros permanentes são registrados em `ultimaFalha` e a
tarefa passa a `FALHOU` após esgotar as tentativas. Arquivos locais são JSON ou
CSV e não são expostos por servidor estático; o download exige chave válida e
propriedade da tarefa pelo parceiro.

Crie o banco e um usuario de aplicacao no PostgreSQL com uma conta administrativa:

```sql
CREATE ROLE greencode LOGIN PASSWORD 'substitua-por-uma-senha-local';
CREATE DATABASE greencode OWNER greencode;
```

Mantenha a senha fora do repositorio e atualize `DATABASE_URL` no `.env` com o
usuario, senha e endereco correspondentes. A conta PostgreSQL da API nao deve
ser superuser.

Se o banco ainda nao tiver as tabelas, aplique as migracoes do projeto na raiz
do repositorio. O comando `npm run prisma:migrate` cria as tabelas que faltam
conforme as migracoes; `npm run prisma:generate` apenas gera o Prisma Client e
nao cria tabelas no banco.

No PowerShell:

```powershell
Copy-Item .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
# Configure GREENCODE_ADMIN_USERNAME and GREENCODE_ADMIN_PASSWORD in .env first.
npm run prisma:create-admin
npm run dev:api
```

O comando `npm run prisma:create-admin` cria somente o primeiro administrador
com os valores dessas variaveis e nao adiciona dados de demonstracao. Ele falha
sem alterar o banco se ja existir qualquer usuario. Para popular um ambiente de
desenvolvimento com dados demonstrativos, use o seed em vez desse comando:

```powershell
npm run prisma:seed
```

No Ubuntu Linux 24.04.3 ou superior, instale Node.js 20.19+ e PostgreSQL 16+
antes de executar os comandos do projeto. Instale Node.js por um instalador
oficial ou gerenciador de versoes (por exemplo, nvm) e confirme `node --version`
e `npm --version`. Os comandos abaixo instalam o servidor PostgreSQL a partir
dos repositorios configurados no sistema:

```bash
sudo apt update
sudo apt install postgresql
sudo systemctl enable --now postgresql
```

Crie a role e o banco com uma senha local segura, sem reutilizar a senha do
exemplo:

```bash
sudo -u postgres psql
```

No prompt do PostgreSQL:

```sql
CREATE ROLE greencode LOGIN PASSWORD 'substitua-por-uma-senha-local';
CREATE DATABASE greencode OWNER greencode;
\q
```

Na raiz do projeto, copie o arquivo de ambiente, edite `.env` para configurar
`DATABASE_URL`, `JWT_SECRET`, `GREENCODE_ADMIN_USERNAME` e
`GREENCODE_ADMIN_PASSWORD`, e execute:

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:create-admin
npm run dev:api
```

Os comandos de build e testes sao os mesmos em PowerShell e Bash:

```bash
npm run check
npm test
npm run build
```

O seed usa somente dados ficticios e identificadores reservados `greencode-seed-*`.
Ele pode ser repetido para restaurar os registros de demonstracao e recusa
execucao quando `NODE_ENV=production`. Nao execute o seed em um banco de
producao. Informe um usuario e senha de desenvolvimento em
`GREENCODE_ADMIN_USERNAME` e `GREENCODE_ADMIN_PASSWORD`; a senha nao tem valor
padrao. O seed cria o administrador apenas se ele ainda nao existir e nao
substitui a senha de uma conta existente. Para criar apenas o primeiro
administrador, sem dados demonstrativos, use `npm run prisma:create-admin`;
esse comando so funciona quando nao ha usuarios no banco.

Para limpar e recriar a massa em desenvolvimento, confirme primeiro que
`DATABASE_URL` aponta para um banco descartavel de desenvolvimento. O comando
abaixo apaga todos os dados desse banco e reaplica as migracoes; em seguida,
execute o seed:

```powershell
npx prisma migrate reset --force
npm run prisma:seed
```

Nao use `migrate reset` em bancos compartilhados ou de producao. Se quiser
preservar outros dados de desenvolvimento, crie um banco separado e vazio,
aponte `DATABASE_URL` para ele, execute `npm run prisma:migrate` e depois
`npm run prisma:seed`. O seed nao apaga registros automaticamente.

### Importar a base da CLI

Para migrar os dados cifrados que ja existem no diretorio `.greencode`, use
uma base PostgreSQL vazia, aplique as migracoes e execute:

```powershell
npm run prisma:deploy
npm run api:import-legacy-data
```

Defina `GREENCODE_DATA_DIR` se os dados da CLI estiverem em outro diretorio.
O importador le os arquivos pela implementacao existente de `RepositorioArquivo`
e grava organizacoes, contratos, lotes, equipamentos, movimentacoes,
parametros globais e credenciais em uma unica transacao. O comando nao imprime
hashes nem dados pessoais. Ele ignora registros que ja existam no banco; por isso, para uma
migracao integral e reproduzivel, use um banco vazio. **Nao execute `seed` e a
importacao legada no mesmo banco**: os dois conjuntos de dados tem organizacoes
de demonstracao e chaves naturais potencialmente conflitantes.

As credenciais legadas usam SHA-256 com salt, mantido somente para permitir a
migracao sem conhecer as senhas. No primeiro login pela API, a senha verificada
e regravada com scrypt. Novas contas da API usam scrypt desde a criacao. A CLI e
a API mantem stores separados depois da importacao: alteracoes feitas na API
nao sao sincronizadas de volta para os arquivos da CLI.

Para iniciar a versao compilada, use `npm run build` e `npm run start:api`.
`npm start` continua iniciando a CLI.

### Autenticacao, autorizacao e versionamento

`POST /auth/login` recebe `{ "usuario": "...", "senha": "..." }`. Em caso de
sucesso, retorna um bearer JWT com identificador e papel, expirando em
`JWT_EXPIRES_IN` (30 minutos por padrao). Envie-o em
`Authorization: Bearer <token>`. As rotas de recursos e a documentacao OpenAPI
interativa sao publicadas em `/documentation`. A SPA local acessa a API pelo
proxy do Vite em `/api`; a API nao habilita CORS para esse fluxo de
desenvolvimento.

O papel e recarregado do banco em cada requisicao protegida, para que uma
alteracao de permissao passe a valer sem esperar a expiracao do token. JWT e
stateless; nao ha lista de revogacao nem endpoint de logout. Um token emitido
continua valido ate expirar se a conta nao for removida. Remover uma conta
invalida seus tokens nas requisicoes seguintes.

Os erros usam `{ "error": { "code": "...", "message": "..." } }`; `400`
representa entrada invalida, `401` autenticacao ausente/invalida, `403`
permissao insuficiente, `404` recurso ou rota inexistente, `409` conflito de
unicidade/integridade/versao e `500` falha inesperada. Respostas de erro nao
incluem rastreamento nem detalhes do banco.

As rotas de mutacao recebem `version` no corpo. O repositorio faz atualizacoes
condicionais em `id + version` e incrementa a versao na mesma transacao. Uma
versao obsoleta retorna `409 VERSION_CONFLICT`, permitindo ao cliente recarregar
o recurso e tentar novamente.

### Rotas

| Metodo e rota | Operacao e permissao |
| --- | --- |
| `POST /auth/login` | Login publico; credenciais invalidas recebem mensagem generica |
| `GET /usuarios`, `GET /usuarios/:id`, `POST /usuarios`, `PATCH /usuarios/:id`, `DELETE /usuarios/:id` | Gerenciamento de contas; `ADMINISTRADOR` |
| `GET /organizacoes`, `GET /organizacoes/:id` | Consulta por `OPERADOR_CADASTRO`, `AUDITOR` ou `ADMINISTRADOR` |
| `POST /organizacoes`, `POST /organizacoes/:id/desativacao`, `DELETE /organizacoes/:id` | Cadastro, desativacao e exclusao conforme permissoes da CLI |
| `POST /organizacoes/:organizacaoId/contratos`, `GET /organizacoes/:organizacaoId/contratos`, `GET /contratos/:id`, `PATCH /contratos/:id`, `DELETE /contratos/:id` | Criacao, consulta, atualizacao e exclusao de contrato |
| `GET /lotes`, `GET /lotes/:id`, `POST /lotes`, `PATCH /lotes/:id`, `POST /lotes/:id/equipamentos`, `POST /lotes/:id/triagem`, `DELETE /lotes/:id` | Lotes, consulta, atualizacao, inclusao de equipamentos e triagem |
| `GET /equipamentos`, `GET /equipamentos/:id`, `GET /equipamentos/:id/rastreamento`, `GET /equipamentos/:id/movimentacoes`, `POST /equipamentos` | Consulta simples, rastreamento e cadastro avulso |
| `PATCH /equipamentos/:id/estado-fisico`, `POST /equipamentos/:id/desmonte`, `POST /equipamentos/:id/desvinculacao`, `DELETE /equipamentos/:id` | Alteracoes de equipamento conforme regras existentes |
| `GET /equipamentos/:id/depreciacao`, `GET /codigos-barras` | Calculo financeiro e geracao de codigo |
| `GET /relatorios/status/:status`, `GET /relatorios/financeiro`, `GET /relatorios/organizacoes/:id` | Relatorios |
| `GET /parametros-globais`, `PATCH /parametros-globais` | Administracao de parametros globais |
| `GET /health` | Verificacao de disponibilidade |

`POST /lotes` aceita um array opcional `equipamentos`; lote e itens sao criados
na mesma transacao. `POST /lotes/:id/equipamentos` tambem e transacional. A
triagem e a movimentacao para desmonte atualizam equipamento(s), versoes e
historico de movimentacoes atomicamente.

`POST /equipamentos` cadastra um equipamento sem lote. `GET /equipamentos/:id`
retorna somente os dados do equipamento; use `/rastreamento` para consultar o
lote, a organizacao e o historico de movimentacoes.

Equipamentos desvinculados tem `loteId: null`, refletindo o comando existente
`equipamento desvincular`. Lotes nao podem ser excluidos com equipamentos
vinculados; equipamentos com movimentacoes nao podem ser apagados, para nao
eliminar o historico. As chaves estrangeiras usam `RESTRICT`, nunca cascata.
CNPJ e normalizado para digitos em uma coluna auxiliar unica, preservando o
valor apresentado pelo usuario.

### Decisoes, trade-offs e limitacoes

- A aplicacao continua monolitica: Fastify, servicos e repositorios sao
  implantados juntos, evitando a complexidade de distribuicao para o escopo da
  atividade. Microservicos foram considerados, mas adicionariam chamadas de
  rede, deploy e observabilidade distribuida sem necessidade demonstrada para
  esta aplicacao.
- Fastify foi escolhido por seus schemas JSON e integracao OpenAPI. Express
  foi considerado, mas exigiria wiring adicional para validacao e documentacao;
  em contrapartida, Fastify adiciona convencoes e plugins especificos.
- PostgreSQL/Prisma substituem arquivos cifrados como persistencia da API:
  constraints relacionais e transacoes protegem os relacionamentos; os
  arquivos criptografados continuam atendendo a CLI legada durante a transicao.
  Arquivos locais foram mantidos para a CLI existente, mas nao oferecem as
  mesmas garantias relacionais e concorrencia para requisicoes HTTP. PostgreSQL
  foi escolhido por fornecer transacoes e constraints relacionais; uma base
  nao relacional foi considerada menos adequada aos vinculos e unicidades do
  dominio. Prisma oferece acesso tipado e migracoes, ao custo de uma camada ORM
  e configuracao adicional em comparacao com SQL direto.
- A API e a CLI tem persistencias separadas: a importacao transfere dados
  legados, mas alteracoes posteriores na API nao sao sincronizadas de volta
  para os arquivos da CLI.
- O relacionamento Contrato-Organizacao e 0..1 para 1; um lote exige
  organizacao; equipamento pode ficar sem lote apos desvinculacao; movimentacoes
  exigem equipamento e nao sao removidas em cascata.
- O schema e a migracao criam as constraints de unicidade, integridade e
  valores minimos. Transicoes de negocio e a validade completa do CNPJ sao
  verificadas pelos servicos/validadores, pois dependem de regras que nao cabem
  nas constraints basicas.
- O cliente da API nao pode escolher estados arbitrarios: a triagem e o
  desmonte sao as transicoes implementadas pela CLI. As demais etapas de
  tratamento do enum ainda nao tem operacoes de negocio na CLI.
- O campo de versao existe nos modelos persistidos, inclusive no historico
  imutavel. Atualizacoes da API usam compare-and-swap; registros de movimentacao
  sao somente inseridos.
- Ha testes automatizados da CLI e testes HTTP com `fastify.inject` para login,
  JWT, autorizacao, schemas e OpenAPI. Os testes transacionais end-to-end
  dependem de PostgreSQL e precisam ser executados em um ambiente de teste.
- A compatibilidade foi verificada neste ambiente Windows com Node.js 24.19.
  Ubuntu Linux 24.04.3 ou superior e suas distribuicoes derivadas sao alvos da
  atividade, mas nao estavam disponiveis para teste nesta execucao; portanto,
  nao se declara compatibilidade validada nessas plataformas. Os fluxos reais
  de banco foram anteriormente verificados no PostgreSQL local, mas a
  compilacao e a inicializacao Linux ainda precisam de validacao nesse sistema.

### Validacao

Backend e CLI (na raiz):

```powershell
npm run check
npm test
npm run build
npm audit --omit=dev
```

Front-end (dentro de `frontend`):

```powershell
npm run lint
npm run build
```

`npm run prisma:generate` e `npx prisma validate` verificam client e schema.
Para confirmar migracoes e fluxos com dados, configure um PostgreSQL de teste,
execute `npm run prisma:migrate` e rode o seed ou o importador (nunca ambos no
mesmo banco).

Problemas comuns:

- `DATABASE_URL e obrigatoria`: configure o `.env` ou as variaveis do processo.
- `JWT_SECRET deve conter ao menos 32 bytes`: gere uma chave aleatoria e nao
  reutilize a senha do banco.
- Falha de conexao: confirme que o PostgreSQL esta ativo, que host/porta/base
  em `DATABASE_URL` estao corretos e que a role tem acesso ao banco.
- Front-end nao alcança a API: confirme que a API escuta em `127.0.0.1:3000`
  e que a SPA esta sendo executada pelo servidor Vite em desenvolvimento. O
  proxy `/api` nao e configuracao de producao.
- Conflito `409 VERSION_CONFLICT`: recarregue o recurso e reenvie a alteracao
  com a versao mais recente, apos revisar os dados atuais. A SPA nao repete
  automaticamente uma operacao conflitante.
