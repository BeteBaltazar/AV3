# Arquitetura de seguranca

## Fluxo de inicializacao

1. `main.ts` verifica `configuracao-mestre.json`.
2. Se o arquivo nao existir, solicita o primeiro administrador e sua senha.
3. `Provisionamento` gera uma chave aleatoria de 256 bits.
4. A credencial inicial e criada com SHA-256 e salt individual.
5. A credencial e gravada separadamente em `dados/credenciais.json`.
6. A configuracao mestre registra o caminho da credencial e a chave AES.
7. `ComposicaoAplicacao` carrega as dependencias e inicia a CLI.

## Criptografia dos arquivos

`CriptografiaArquivo` usa AES-256-GCM, implementado pelo modulo nativo `node:crypto`.

- AES-256 fornece uma chave simetrica de 256 bits.
- GCM fornece confidencialidade e autenticidade.
- Cada operacao usa um IV aleatorio de 12 bytes.
- A tag de autenticacao detecta adulteracao.
- O payload e armazenado como `iv.tag.conteudo` em Base64URL.
- O repositorio usa escrita atomica com arquivo temporario e renomeacao.

A escolha de AES-256 atende ao requisito de cifrar os arquivos de persistencia sem adicionar dependencia externa.

## Senhas

As senhas nao sao armazenadas em texto plano.

Para cada credencial:

1. e gerado um salt individual de 16 bytes;
2. a senha e combinada com o salt;
3. o resultado e processado com SHA-256;
4. o hash e armazenado em hexadecimal;
5. a verificacao usa comparacao resistente a timing.

O salt individual impede que usuarios com a mesma senha tenham o mesmo hash armazenado.

## Sessoes

- Uma sessao expira apos 30 minutos sem atividade valida.
- A validacao de um token valido renova a expiracao.
- Sessoes expiradas sao removidas da colecao ativa.
- Logout remove a sessao explicitamente.

O limite de 30 minutos e um equilibrio entre reduzir o tempo em que uma sessao
abandonada pode ser reutilizada e evitar que o usuario tenha de autenticar
novamente em intervalos muito curtos durante a operacao normal. A expiracao e
por inatividade: uma operacao que valida um token ativo renova o prazo; a
atividade nao prolonga uma sessao que ja expirou.

## Permissoes

A matriz de permissoes fica em `ControlePermissoes`.

- `ADMINISTRADOR`: contas e parametros administrativos.
- `OPERADOR_CADASTRO`: organizacoes e contratos.
- `GESTOR_ALMOXARIFADO`: lotes, triagem e codigos de barras.
- `AUDITOR`: historicos e relatorios.

A CLI oculta comandos sem permissao, mas os servicos verificam a permissao novamente. Portanto, chamar o servico diretamente nao ignora a autorizacao.

## Chave mestre

A implementacao atual usa a opcao 3 definida durante o desenvolvimento: a chave AES fica em texto claro dentro de `configuracao-mestre.json`.

Essa decisao simplifica a atividade e permite inicializacao multiplataforma, mas tem uma limitacao importante: quem obtiver o arquivo mestre pode obter a chave e decifrar os dados.

Em um ambiente de producao, a chave deveria ser protegida por um mecanismo externo, como um cofre de segredos, variavel de ambiente protegida ou mecanismo nativo do sistema operacional. Essa melhoria nao foi adicionada para manter o escopo da AV1.

## Journal

`JournalTransacao` registra:

- identificador;
- timestamp;
- operacao;
- entidade;
- dados anteriores;
- dados posteriores;
- usuario responsavel.

Os registros sao cifrados, escritos atomicamente e rotacionados quando o arquivo ultrapassa 10 MB. Arquivos rotacionados com mais de 180 dias sao removidos.

Na escrita atomica, o journal grava em um arquivo temporario e depois o renomeia
para o arquivo de destino. Se a gravação ou a renomeação falhar, o temporario e
removido e o erro original e propagado. Se a limpeza tambem falhar, ambas as
falhas sao reportadas juntas. Isso evita tratar uma operacao incompleta como
sucesso e reduz a permanencia de temporarios apos falhas.

## Falhas testadas e resposta do sistema

Os testes em `test/av1.test.ts` exercitam os cenarios abaixo e verificam as
respostas descritas:

- **CNPJ invalido:** a validacao da organizacao falha e o servico nao a cadastra.
- **CNPJ duplicado:** o segundo cadastro e rejeitado, inclusive quando os
  mesmos 14 digitos sao apresentados com formatacao diferente.
- **Data futura ou anterior a 90 dias:** a validacao do lote falha e o lote nao
  e persistido.
- **Desmonte sem triagem:** o servico rejeita a movimentacao e mantem o
  equipamento fora do estado `EM_DESMONTE`.
- **Repeticao da triagem:** o servico rejeita triar novamente um lote que ja
  deixou `RECEBIDO`, prevenindo movimentacoes duplicadas no historico.
- **Queda de duas ou mais categorias no estado fisico sem justificativa:** a
  validacao falha; com justificativa textual, a alteracao e aceita.
- **Senha incorreta:** o login falha com erro de credenciais invalidas e nao
  cria uma sessao autenticada.
- **Sessao expirada:** o token e rejeitado e removido da lista de sessoes
  ativas; operacoes protegidas com ele falham.
- **Papel sem permissao:** o controle de permissao rejeita a operacao mesmo
  que ela seja chamada diretamente no servico.
- **Arquivo temporario orfao no repositorio:** a proxima leitura do arquivo
  correspondente remove o temporario.
- **Falha no repositorio durante escrita:** o erro e propagado e o temporario
  criado por aquela tentativa e removido.
- **Falha de renomeacao do journal:** o erro da renomeacao e propagado, o
  temporario e removido e o arquivo de destino anterior nao e substituido.
- **Falha simultanea ao gravar e limpar temporario do journal:** o codigo
  agrega os erros de escrita e limpeza em `AggregateError`; o teste automatizado
  cobre falha na renomeacao e limpeza bem-sucedida.
- **Rotacao do journal:** ao ultrapassar o limite configurado, o arquivo atual
  e rotacionado e o novo registro fica no arquivo atual cifrado.
- **Retencao do journal:** arquivos rotacionados com mais de 180 dias sao
  removidos na proxima gravacao; arquivos recentes sao mantidos.
- **Provisionamento inicial e primeiro login:** a chave de 256 bits e a
  credencial inicial sao criadas e o login com a senha correta e aceito.
- **Rastreabilidade apos movimentacoes:** a consulta retorna organizacao,
  lote, equipamento e movimentacoes em ordem cronologica, e o journal inclui
  os eventos da jornada.

Estes testes verificam o comportamento funcional esperado; nao substituem uma
auditoria de seguranca nem simulam todas as falhas possiveis do sistema de
arquivos ou do sistema operacional.
