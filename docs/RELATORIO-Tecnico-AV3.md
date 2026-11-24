# Relatorio Tecnico - AV3

## 1. Arquitetura desenvolvida

O projeto manteve a arquitetura existente e adicionou tres pilares sem criar um
sistema paralelo:

1. A camada analitica reutiliza o Prisma e os dados de lotes, equipamentos e
   movimentacoes.
2. A API publica separa autenticacao administrativa JWT das chaves de API dos
   parceiros.
3. A fila pg-boss no PostgreSQL recebe tarefas analiticas, enquanto workers independentes
   executam os calculos e produzem arquivos JSON ou CSV.

O projeto continua dividido em dominio, seguranca, infraestrutura, API,
servicos, analises e fila. Os calculos nao ficam duplicados: o worker chama os
mesmos modulos da pasta `src/analysis` usados pela API interna.

## 2. Biblioteca estatistica

Nao foi adicionada uma biblioteca estatistica externa. Os metodos foram
implementados em TypeScript:

- Eficiência operacional: diferença entre `dataEntrada` e a movimentação de
  conclusão `TRIAGEM`, com média aritmética por lote e responsável.
- Rentabilidade: média aritmética do valor real de recuperação, quando
  disponível, ou do valor estimado. Valores ausentes são excluídos.
- Vida útil remanescente: regressão linear simples sobre os estados físicos
  registrados ao longo do tempo. O método foi escolhido por ser determinístico,
  justificável e adequado a poucas observações. O resultado é uma estimativa,
  nunca uma garantia.

Os dados insuficientes são informados explicitamente. Nao são gerados valores
inventados.

## 3. Modelagem analitica

Foram adicionadas as tabelas:

- `ResultadoAnalise`: persiste categoria, período, método, dados utilizados,
  resultado, observações, data de execução e isolamento opcional por parceiro
  e organização.
- `HistoricoEstadoFisico`: registra a evolução temporal dos estados físicos.
- `Parceiro`: representa parceiros externos e seus limites e permissões.
- `ChaveApi`: guarda apenas o hash SHA-256 da chave, prefixo e revogação.
- `TarefaRelatorio`: registra estado, proprietário, formato, tentativas,
  falha, timestamps e caminho do relatório concluído.

Também foram adicionados ao equipamento `valorEstimadoRecuperacao` e
`valorRecuperacaoReal`. Os campos são opcionais para não criar dados fictícios.

## 4. API publica

Os parceiros são administrados por rotas `/api/v1/admin` protegidas por JWT.
A comunicação externa usa `/api/v1/public` e o cabeçalho `x-api-key`.

O segredo completo é exibido uma única vez no cadastro. Cada requisição recebe
SHA-256 da chave e compara o hash com `ChaveApi`. Chaves revogadas ou parceiros
desativados são rejeitados.

Permissões implementadas:

- `RASTREABILIDADE_LEITURA`
- `LOTE_CONSULTAR`
- `LOTE_CADASTRAR`
- `ANALISE_CONSULTAR`
- `ANALISE_EXECUTAR`

Análises e lotes são separados por organização; tarefas e arquivos só podem ser
consultados pelo parceiro proprietário.

## 5. Rate limit

`@fastify/rate-limit` aplica limite por chave API ou IP, com padrão de 100
requisições por 60 segundos. O excedente retorna HTTP 429 com
`RATE_LIMIT_EXCEEDED`.

Os limites podem ser ajustados por parceiro no banco. O rate limit HTTP utiliza
o armazenamento local do plugin; em implantacoes com varias instancias, deve
ser usado um limitador compartilhado no proxy ou configurado um storage distribuido.

## 6. Fila PostgreSQL

`pg-boss` persiste a fila `greencode-relatorios` no PostgreSQL e gerencia as
tabelas em seu proprio schema. A API grava a tarefa de relatorio, registra o job
no PostgreSQL com o mesmo identificador da tarefa e responde HTTP 202 sem
executar calculo pesado.

O worker consome os jobs usando o mesmo `DATABASE_URL`, calcula o relatorio com
os modulos analiticos e grava o arquivo em `REPORT_OUTPUT_DIR`. JSON e CSV sao
permitidos. A fila e independente de plataforma e nao requer Redis.

O usuario PostgreSQL precisa ter permissao para que pg-boss crie e atualize seu
schema. Tanto API quanto worker podem ser executados em multiplos processos.

## 7. Retry

A política implementada por tarefa é:

- máximo de 3 execuções (uma tentativa inicial e duas retentativas);
- backoff exponencial;
- atraso inicial de 5 segundos, configurado em segundos para pg-boss;
- estado intermediário `AGUARDANDO_PROCESSAMENTO`;
- estado final `FALHOU` após a última tentativa;
- mensagem da falha em `ultimaFalha`.

O ID do job e o identificador da tarefa. O resultado analitico fica associado
de forma unica a tarefa e e atualizado em retentativas, evitando duplicacoes.
Tarefas ja concluidas nao sao recalculadas.

## 8. Escalabilidade

Para centenas ou milhares de parceiros:

- execute vários workers com concorrência limitada;
- mantenha PostgreSQL dimensionado e monitorado para a aplicacao e a fila;
- use autenticação por chave e isolamento por organização;
- use workers horizontais para aumentar capacidade;
- preserve os arquivos em armazenamento compartilhado ou objeto em produção;
- use um limitador compartilhado no proxy para counters de rate limit;
- monitore filas, latência e erros por tarefa;
- aplique retenção a arquivos antigos e resultados históricos.

O diretório local implementado atualmente é adequado ao desenvolvimento e a
implantação monolítica. Não substitui armazenamento distribuído em produção.

## 9. Compatibilidade

A implementação foi validada com:

- Windows 10 ou superior;
- Node.js 20.19 ou superior;
- PostgreSQL 16 ou superior;
- PostgreSQL acessivel pela API e pelos workers.

Ubuntu Linux 24.04.03 ou distribuições derivadas podem executar os mesmos
comandos. No Linux, instale Node.js por gerenciador de versões ou instalador
oficial e PostgreSQL pelos pacotes da distribuicao ou por servicos gerenciados.

## 10. Limitações

- A fila e seus workers dependem da disponibilidade do PostgreSQL.
- O histórico de estados físicos precisa observar novos estados ao longo do
  tempo para produzir previsões úteis.
- A previsão linear não deve ser interpretada como garantia.
- Os arquivos locais não têm replicação nem CDN.
- A API pública não possui chaves TLS próprias, dependente do proxy/servidor
  HTTPS do ambiente de implantação.
