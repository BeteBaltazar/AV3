# Greencode Front-end

Aplicacao web independente criada com React, TypeScript e Vite. A SPA inclui
proxy local de desenvolvimento, cliente HTTP centralizado, autenticacao,
controle de navegacao por papel e telas para os recursos da API.

## Requisitos

- Node.js 20.19 ou superior
- npm

## Executar em desenvolvimento

Na pasta `frontend`:

```powershell
npm install
npm run dev
```

O Vite informa no terminal o endereco local da aplicacao.

## Proxy local para a API

No desenvolvimento, o Vite encaminha requisicoes iniciadas por `/api` para
`http://127.0.0.1:3000`, removendo o prefixo `/api` do caminho. Por exemplo,
`/api/health` e encaminhado para `/health` no backend. Isso permite que o
navegador use a mesma origem do front-end e evita habilitar CORS no servidor.

Confirme que a API esta em execucao com `npm run dev:api` na raiz do projeto.
O proxy aplica-se ao servidor de desenvolvimento do Vite; nao configura o
roteamento de producao.

## Cliente HTTP

Use `src/lib/api-client.ts` para requisicoes a API. A funcao `apiRequest<T>`
adiciona o prefixo `/api`, serializa corpos como JSON, envia um bearer token
quando fornecido e retorna `undefined` para respostas sem corpo, como HTTP 204.
Erros HTTP sao lancados como `ApiError`, com `status`, `code` e `message`.

Exemplo de login publico:

```ts
import { apiRequest } from './lib/api-client'

const login = await apiRequest<{
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: string
}>('/auth/login', {
  method: 'POST',
  body: { usuario: 'operador', senha: 'senha-local' },
})
```

Exemplo de requisicao protegida:

```ts
const organizacoes = await apiRequest<Organizacao[]>('/organizacoes', {
  token: accessToken,
})
```

`ApiError.status` permite tratar 400, 401, 403, 404 e 409 de forma distinta.
Uma resposta fora do formato esperado continua expondo seu status e recebe o
codigo `HTTP_ERROR`; resposta JSON invalida em caso de sucesso recebe
`INVALID_RESPONSE`. Erros de rede permanecem erros originais do `fetch`.

## Autenticacao e acesso por papel

A tela de login envia usuario e senha a `POST /auth/login`. O token e mantido
somente na memoria da aplicacao; atualizar ou fechar a pagina encerra a sessao
local. A interface usa a claim `exp` do JWT para limpar a sessao quando o token
vence. O botao "Sair" tambem remove o token local, pois a API nao oferece uma
rota de logout. A API nao renova tokens automaticamente: ao receber HTTP 401
em uma requisicao autenticada, `authenticatedRequest` limpa a sessao e a
interface volta ao login.

O papel lido do claim `role` do JWT filtra a navegacao. Essa leitura nao valida
a assinatura nem concede permissoes. A API continua sendo a autoridade:
envia-se o bearer token em cada operacao e o backend verifica o usuario e sua
permissao.

## Telas e recursos

Depois do login, a navegação mostra as áreas permitidas para o papel atual:

- Administrador: usuários, organizações, contratos, lotes, equipamentos,
  rastreabilidade, relatórios e parâmetros globais.
- Operador de cadastro: organizações e contratos.
- Gestor de almoxarifado: chegada/triagem de lotes e operações de equipamentos.
- Auditor: consulta de organizações, contratos, lotes, equipamentos,
  rastreabilidade e relatórios.

As telas usam as rotas e os campos publicados pela API OpenAPI. Organizações,
criação/consulta de contratos, lotes, equipamentos, rastreabilidade, relatórios,
usuários e parâmetros têm formulários ou visualizações correspondentes. A API
não fornece listagem de contratos nem consulta de lotes para o gestor de
almoxarifado: por isso, contratos são consultados por ID pelos papéis
autorizados e o gestor vê os lotes criados durante a sessão corrente.

Os dados e operações ainda dependem das permissões e limitações das rotas do
backend. Um item visível na interface não substitui a autorização do servidor.
As atualizações enviam a versão devolvida pela API quando disponível; em
operações em que o perfil não pode consultar o registro, a tela solicita o ID
e a versão atual.

Quando uma operação versionada recebe `409 VERSION_CONFLICT`, a interface não
repete a alteração. Ela recarrega o recurso quando a rota de consulta está
disponível, atualiza a versão exibida e pede que o usuário revise os dados antes
de tentar novamente. Para perfis sem permissão de consulta do recurso, a tela
explica que não conseguiu atualizá-lo e orienta obter a versão atual por um
perfil autorizado; quando há uma versão local em memória, bloqueia novas
operações sobre ela ou limpa o número de versão para evitar uma repetição com
dados vencidos.

Os formulários usam a validação nativa dos campos obrigatórios, formatos,
intervalos e tipos de entrada; validações específicas da API são apresentadas
junto ao formulário e, quando identificadas para um campo (como CNPJ inválido
ou formato das alíquotas), junto a esse campo. As mensagens de erro diferenciam
entrada inválida (400), sessão inválida (401), falta de permissão (403), recurso
ausente (404) e conflitos de negócio (409). Falhas 5xx não exibem detalhes
internos. Envios de ação são bloqueados enquanto há uma requisição em curso e
os valores dos formulários só são limpos após sucesso.

## Validar e compilar

```powershell
npm run lint
npm run build
```
