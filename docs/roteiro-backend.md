# Roteiro didático do backend STMA

Início: 12/10/2026. Fases 1 e 2 concluídas. **Fase 3 — Cadastros e auditoria**
implementada, em validação final. Registros nas seções 10 e 11.
Este roteiro acompanha a implementação real; fases futuras serão acrescentadas
somente quando executadas. O roteiro do frontend será criado ao iniciar o frontend.

## 1. Decisões que orientam esta versão

O proprietário confirmou `docs/03-implementacao/stma_schema.sql` como fonte da
verdade: 13 tabelas e a view `vw_ambiente_estado`. O arquivo `schema-stma.sql`
da pasta SENAI é o modelo anterior, com nomes em inglês, e não será aplicado.

A instrução de 12/10 prevalece sobre a proposta de Prisma do plano: usamos
**Node.js + Express + TypeScript estrito + mysql2, sem ORM**. Node 22.23.3 já
instalado foi mantido; o CI também usa Node 22. O plano mencionava Node 20.
Prisma é uma evolução futura do adaptador de persistência, não uma dependência
desta versão. Autenticação com sessão/argon2 está descrita na seção 10.

O diagrama novo substitui a conexão direta navegador/broker por **SSE via API**.
O backend recebe MQTT, persiste e avisa somente a empresa autorizada. O frontend
não receberá credenciais MQTT. A ADR-001 continua válida para a troca de broker,
mas a exigência de WSS para o navegador não se aplica mais a este desenho.
O antigo `check:mqtt` continua sendo ferramenta legada de TLS/WSS, não critério
de aceite do backend STMA. A ingestão usará os tópicos `engeasier/+/dados`,
`engeasier/+/porta` e `engeasier/+/status`, conforme o novo plano.

O pedido atual autoriza começar o backend antes da conclusão do antigo T0.2.
Os planos STMA passam a governar as fases; o plano antigo preserva o histórico.

## 2. O que MVC e separação de responsabilidades significam aqui

```text
Requisição HTTP
  → app.ts (rotas e middlewares)
  → controller (HTTP: entrada, status e JSON)
  → service (caso de uso, sem Express ou SQL)
  → interface do repository (contrato do Model)
  → implementação MySQL do repository (SQL parametrizado)
  → pool mysql2 → MySQL local ou Aiven
```

O Model abrange contratos e operações de persistência; a View da API é sua
resposta JSON. A interface gráfica fica no projeto frontend futuro. No exemplo
implementado, `HealthRepository` promete apenas `ping(): Promise<void>`. O serviço
não conhece conexões nem SQL. `main.ts` monta as dependências concretas e as
injeta na aplicação. Isso evita criar clientes de banco espalhados pelo código.

Para adotar Prisma depois, implementar os mesmos contratos com Prisma e mudar
a composição em `main.ts`. Não levar tipos do Prisma/mysql2 para controllers ou
serviços. Transações entre múltiplos repositórios precisarão de um contrato de
unidade de trabalho na fase que as utilizar; não prometemos migração sem testes.

Arquivos desta etapa:

| Arquivo em backend/ | O que ensina |
|---|---|
| src/config/env.ts | Validar ambiente antes de iniciar; selecionar um destino de banco |
| src/db/mysql.ts | Pool, TLS e UTC; detalhes do driver ficam no adaptador |
| src/modules/health/health.repository.ts | Contrato sem dependência de infraestrutura |
| src/modules/health/mysql-health.repository.ts | Consulta real isolada da regra |
| src/modules/health/health.service.ts | Caso de uso independente de HTTP |
| src/modules/health/health.controller.ts | Conversão do resultado em HTTP |
| src/app.ts | Montagem do Express, Helmet, limite de JSON e erros |
| src/main.ts | Inicialização e encerramento de servidor/pool |
| migrations/001_stma_schema.sql | Cópia integral do schema definitivo confirmado |
| src/db/migrate.ts | Aplicação inicial em banco vazio, sem apagar dados |
| src/db/check.ts | Verificação de schema, UTC e TLS sem inserir dados |

## 3. Preparar dependências

Abra PowerShell na raiz `01-sistema-monitoramento`:

```powershell
node --version
npm --prefix backend ci
```

Se esta rede apresentar erro de cadeia de certificado no npm, o ambiente já foi
validado com `$env:NODE_OPTIONS='--use-system-ca'` no Node instalado. Isso usa
as autoridades confiáveis do Windows e mantém a validação TLS habilitada.
Não desabilitar SSL para contornar erros.

As dependências da base são Express, mysql2, Zod, Pino e Helmet. TypeScript/tsx
compilam/executam o código; ESLint verifica estilo e erros; Vitest/Supertest
verificam configuração e HTTP. Pacotes do setup antigo ainda presentes não
significam que JWT, bcrypt ou ingestão tenham sido adotados no backend novo.

## 4. Configurar MySQL local e Aiven

O backend lê **backend/.env**. O `.env` da raiz continua reservado ao setup
legado; nenhum segredo existente foi sobrescrito. Na primeira instalação:

```powershell
# Somente se backend/.env ainda não existir:
Copy-Item backend/.env.example backend/.env
```

Preencha os dois grupos `DB_LOCAL_*` e `DB_AIVEN_*`. `DB_TARGET=local` escolhe
o primeiro; `DB_TARGET=aiven` escolhe o segundo. Reinicie a API após editar.
Variáveis definidas no terminal/host prevalecem sobre o arquivo: remova um
override antigo com `Remove-Item Env:DB_TARGET -ErrorAction SilentlyContinue`.

Local: `127.0.0.1:13308`, banco `stma_db`. O Compose STMA usa projeto, volume e
porta próprios, preservando o contêiner e banco `monitoramento_iot` anteriores.
Senhas aleatórias foram geradas para o ambiente local, não para o Git.

```powershell
docker compose --env-file backend/.env -f compose.stma.yaml up -d --wait
```

Aiven: serviço informado **mysql-2f5ead7**, projeto **jorgeluizdossantos-7084**.
No painel do serviço, copie os parâmetros de conexão e baixe a CA. A configuração
local usa `DB_AIVEN_CA_FILE=certs/ca.pem`, correspondendo ao arquivo fornecido.
Na instalação de outra pessoa, ajuste esse caminho ao nome efetivamente salvo.

O adaptador exige CA para Aiven, `rejectUnauthorized=true` e
`verifyIdentity=true`: valida a cadeia e o nome do servidor. O ambiente de
produção exige o destino Aiven com TLS nesta versão. Não coloque IP no lugar
do hostname do certificado. O navegador nunca acessa o MySQL.
[Referência Aiven](https://aiven.io/docs/products/mysql/howto/connect-from-mysql-workbench).

## 5. Aplicar e conferir o schema

Com o destino selecionado e credenciais válidas:

```powershell
npm --prefix backend run migrate
npm --prefix backend run db:check
```

`migrate` cria o banco configurado caso não exista e executa a migração 001
somente se estiver vazio. O usuário precisa das permissões de criação de banco,
tabelas e view. O nome do banco vem da configuração validada; a cópia original
do SQL é preservada e seus comandos CREATE DATABASE/USE são substituídos pela
seleção controlada do destino. `multipleStatements` é usado exclusivamente
nesse script com SQL confiável versionado; fica desligado no pool da API.

Se o banco já contiver tabelas, o script retorna `DATABASE_NOT_EMPTY` e não
reaplica o schema. Isso não é um migrador incremental completo: alterações
futuras terão arquivos SQL numerados e um mecanismo de controle a implementar
antes da próxima migração. Não usar `DROP` ou recriar banco para atualizar.
DDL MySQL não é transacional; em falha parcial, inspecionar antes de continuar.

`db:check` confirma as 13 tabelas esperadas, a view, UTC e TLS no Aiven. Não
carrega o seed demo: dados demonstrativos pertencem à fase correspondente.
Os DEFAULTs do MySQL usam a sessão: por isso cada conexão adquirida executa
`SET time_zone='+00:00'`; apenas `timezone:'Z'` no driver não seria suficiente.

## 6. Executar e experimentar a API

```powershell
npm --prefix backend run dev
# Em outro terminal:
Invoke-RestMethod http://localhost:3000/health
```

Resposta esperada após consultar o banco: `{"status":"ok","database":"up"}`,
HTTP 200. Se o banco falhar durante a execução, a rota retorna 503 com erro JSON
genérico. A API não inicia se a configuração/conexão inicial falhar. `/health`
é prontidão da infraestrutura, não comprova schema nem conclusão funcional:
para verificar o schema, use também `db:check`.

`GET /health` é a única rota implementada nesta etapa. Login, CRUD, MQTT, SSE e
agendador não foram antecipados. Ao terminar, Ctrl+C encerra servidor e pool.
Para executar código compilado: `npm --prefix backend run build`, depois
`npm --prefix backend start`.

## 7. Validar a etapa

```powershell
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend test
$env:NODE_ENV='test'
$env:DB_TARGET='local'
npm --prefix backend run test:integration
Remove-Item Env:NODE_ENV
Remove-Item Env:DB_TARGET
npm --prefix backend run build
```

Os testes HTTP usam um repositório substituto para testar falhas e respostas
sem depender da rede. A integração usa MySQL real, confere as 13 tabelas/view,
UTC, bloqueio de vínculo entre empresas e CHECK de faixa inválida; desfaz os
dados de teste com rollback. Integração é recusada se apontar para Aiven ou
se NODE_ENV não for test. O pipeline GitHub Actions repete a validação com um
MySQL descartável. Credenciais fixas do CI são exclusivas desse contêiner efêmero.

## 8. Preparação da passagem MQTT → banco (Fase 4, não implementada)

O desenho a seguir orientará a implementação gradual:

1. **Adaptador MQTT:** lê endpoint TLS, credenciais, CA e client ID da configuração.
   Conecta, assina os tópicos e entrega tópico/payload ao caso de uso. Trocar
   Mosquitto, EMQX ou HiveMQ não deve alterar a regra de ingestão.
2. **Validação:** extrai device_id, valida formato e medidas com Zod. Mensagem
   inválida gera diagnóstico controlado, sem cair o processo.
3. **Resolução:** repository procura dispositivo ativo e seu ambiente/empresa;
   a empresa não será aceita do payload. Desconhecidos seguem o fluxo de pendentes.
4. **Transação:** repository grava leitura idempotente e atualiza a última
   leitura sem retroceder no tempo. Casos de concorrência serão testados.
5. **Alertas:** implementados na fase prevista; persistência e evento devem
   respeitar o commit. SSE só recebe evento confirmado para a empresa correta.
6. **Troca de broker:** preparar destino com TLS/ACLs equivalentes, alterar
   configuração do backend e firmware e reconectar de forma coordenada.
   Não há migração automática de filas, sessões ou mensagens retidas.

Antes da Fase 4, esclarecer idempotência quando firmware não envia timestamp,
tratamento de mensagens atrasadas/duplicadas e adoção de dispositivos pendentes
por empresa. Assinatura QoS 1 não transforma publicação QoS 0 em entrega garantida.
Essas pendências não bloqueiam a base HTTP/MySQL, mas precisam de decisão antes
da implementação da ingestão. A documentação incluirá exemplos e testes reais
de publicação, persistência, reconexão e falhas quando chegarmos a essa fase.

## 9. Registro de execução e próximos passos

| Verificação em 12/10/2026 | Resultado |
|---|---|
| ESLint, TypeScript e build | Aprovados |
| Configuração e HTTP | 6 testes aprovados |
| Integração MySQL 8 real | 3 testes aprovados |
| Schema MySQL local | 13 tabelas, view e UTC confirmados |
| Schema MySQL Aiven | 13 tabelas, view, UTC e TLS ativo confirmados |
| HTTP compilado apontando ao Aiven | GET /health: 200, status ok, database up |
| Auditoria npm após atualização das ferramentas | 0 vulnerabilidades reportadas |
| CI no GitHub | Aprovado — execução 38311559868, commit ea1ea4c |

Problemas encontrados e resolvidos: nome da CA diferente do exemplo (ajustado
para certs/ca.pem); primeira conexão Aiven expirou (timeout local configurado
para 20 segundos); Vitest antigo trouxe vulnerabilidades em dependências de
teste (atualizado para 5.0.4, com nova validação); uma execução de testes foi
interrompida por edição concorrente do package.json (reexecutada após estabilizar
o arquivo). Nenhum desses resultados foi tratado como teste aprovado antes do reteste.

O seed de demonstração não foi carregado e os três usuários de banco com
permissões específicas permanecem na Fase 7. A conexão atual usa a credencial
informada para provisionamento; antes de expor a aplicação, separar usuário
de migração e usuário de execução conforme o plano. Não há aplicação em produção
publicada: o Aiven é o banco de destino validado, ainda sem dados de negócio.

Feito: base MVC/contratos, local/Aiven, documentação e CI remoto aprovado.
Entrega: commit ea1ea4c, tag backend-fase-1. Fase 1 encerrada.
Próximo passo: Fase 2, autenticação por sessão, argon2 e isolamento por empresa.
Situação ao encerrar a Fase 1: Fases 2–7 e frontend ainda não iniciados.

Evidência CI: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38311559868

## 10. Fase 2 — autenticação, sessão e perfis

### 10.1 Escopo e sequência da implementação

1. Revisamos RF001, RF015, RN001 e RN007, a matriz de perfis e as tabelas
   `usuario`, `empresa` e `sessao` do schema definitivo. Não houve alteração
   de schema nem reaplicação da migração 001.
2. Instalamos Argon2 para senhas, `cookie` para ler cookies e
   `express-rate-limit` para limitar tentativas. O parser `cookie` 2 usa uma
   resolução de módulos incompatível com a configuração existente; usamos
   a versão 1, compatível com CommonJS, e validamos compilação e testes.
3. Criamos o contrato `AuthRepository`, o serviço, o adaptador MySQL, os
   middlewares de sessão/perfil, o controller e as rotas.
4. Montamos essas dependências em `main.ts` e acrescentamos configuração
   validada, respostas de erro e testes automatizados.
5. Validamos localmente 18 testes sem banco e 8 testes com MySQL real, além
   de lint, typecheck e build. O CI executa os mesmos comandos.

### 10.2 Responsabilidades e caminho de uma requisição

| Arquivo em backend/src/modules/auth/ | Responsabilidade |
|---|---|
| auth.repository.ts | Tipos de usuário/perfil e contrato de persistência |
| mysql-auth.repository.ts | SQL parametrizado; transação de criação/rotação de sessão |
| auth.service.ts | Verificar senha, gerar token, autenticar sessão e revogar |
| auth.middleware.ts | Ler cookie, preencher req.auth e verificar permissão explícita |
| auth.controller.ts | Converter requisição em chamada de serviço; JSON, cookies e status |
| auth.routes.ts | Associar URL, validação, limite de tentativas e controller |

O serviço não importa Express nem mysql2. Para adotar Prisma futuramente,
substitua o adaptador que implementa `AuthRepository`, preservando os testes
e a transação. Os perfis e o identificador da empresa são dados do banco;
não são aceitos como autoridade em parâmetros enviados pelo cliente.

Fluxo de login:

1. O Express exige JSON e verifica a origem informada pelo navegador.
2. Aplica limite por IP, valida os campos e normaliza o e-mail para minúsculas.
3. Aplica limite por e-mail; procura usuário e empresa ativos.
4. Verifica a senha com Argon2. Para e-mail inexistente, também verifica um
   hash Argon2 válido, gerado ao iniciar o serviço. Ambos os erros retornam
   a mesma resposta 401; isso não constitui garantia de tempo constante.
5. Gera 32 bytes aleatórios, representados por 64 caracteres hexadecimais.
   O navegador recebe o token; o banco recebe somente seu SHA-256.
6. Numa transação, revalida usuário/empresa, insere sessão, atualiza
   `ultimo_login_em` e revoga a sessão do cookie anterior, se houver.
7. Após o commit, o controller emite o cookie e devolve o usuário sem senha.

O cookie não precisa de uma chave de assinatura: o servidor só aceita tokens
aleatórios cujo hash existe como sessão válida no banco. Não usamos JWT nem
bcrypt no módulo novo. As dependências legadas não definem esta arquitetura.

### 10.3 Configuração e contrato HTTP

Acrescente ou ajuste em `backend/.env`:

```dotenv
SESSION_TTL_HOURS=8
SESSION_COOKIE_SECURE=true
PUBLIC_ORIGIN=http://localhost:3000
AUTH_IP_LIMIT=20
AUTH_EMAIL_LIMIT=5
```

Para experimentar com navegador em **HTTP local**, use explicitamente
`SESSION_COOKIE_SECURE=false` em desenvolvimento. Para produção, use `true`
e a origem HTTPS pública do frontend, sem caminho nem barra final.
`NODE_ENV=production` recusa cookie inseguro ou origem HTTP. Reinicie o backend
depois de editar. A escolha do banco continua sendo somente `DB_TARGET`;
o módulo de autenticação não possui SQL específico do Aiven.

| Requisição | Entrada | Saída esperada |
|---|---|---|
| POST /api/v1/auth/login | JSON com email e senha | 200, `{ usuario: { id, empresa_id, nome, email, perfil } }` e Set-Cookie |
| GET /api/v1/auth/me | Cookie da sessão | 200 e mesmo formato de usuário |
| POST /api/v1/auth/logout | Cookie e JSON vazio `{}` | 204, cookie removido e revogada_em preenchida |

Respostas de autenticação usam `Cache-Control: no-store`. O cookie é host-only
(sem Domain), Path=/, HttpOnly, SameSite=Lax e Secure por padrão. A expiração
é fixa, sem renovação silenciosa. Novo login gira o token e revoga o anterior
apresentado; sessões de outros dispositivos continuam válidas até expirar ou
realizar logout. Repetir logout com sessão revogada retorna 401.

Toda requisição autenticada consulta a sessão, usuário e empresa novamente.
Expiração, revogação, desativação ou alteração de perfil têm efeito na próxima
requisição. `req.auth` recebe somente o usuário e seu escopo atual.

Erros seguem `{ erro: { codigo, mensagem, campos: [] } }`: validação 400,
credenciais/sessão 401, perfil/origem 403, recurso de outra empresa 404,
Content-Type inadequado 415 e excesso de tentativas 429 com Retry-After.
Erros internos continuam genéricos, sem SQL, credenciais ou token nos logs.

### 10.4 Perfis, isolamento e proteção do navegador

`requireRoles(...)` exige uma lista explícita. Administrador pode ser incluído
nas rotas de cadastro; operador nas rotas de operação; leitor somente nas
rotas de leitura. Superadmin não herda acesso aos dados das empresas. A função
`companyId(req.auth)` rejeita usuários sem vínculo com empresa.

Na Fase 3, cada repositório de recurso deve obrigatoriamente consultar com
`WHERE id=? AND empresa_id=?`, usando o segundo parâmetro da sessão. Retornar
404 quando não houver linha impede revelar a existência de recurso alheio.
Nesta fase, uma rota criada **apenas no teste** consulta uma empresa pelo ID
pedido e pelo escopo autenticado. O teste prova 200 para A, 404 para B e 403
para escrita por leitor. Não há CRUD público implementado nesta entrega.

POST exige JSON; uma origem presente deve coincidir com PUBLIC_ORIGIN, e
`Sec-Fetch-Site: cross-site` é rejeitado. Não habilitamos CORS. Clientes de
terminal sem Origin continuam permitidos. O frontend usará o mesmo domínio
por proxy conforme o plano; estes controles devem acompanhar futuras rotas
de escrita. SameSite não é a única proteção aplicada.

Limites: 20 tentativas por IP e 5 por e-mail a cada 15 minutos, contando
sucessos e falhas. O armazenamento é em memória de um processo; reiniciar
zera contadores. Antes de múltiplas instâncias, adotar armazenamento
compartilhado. O Express mantém `trust proxy` desabilitado: no deploy,
configurar somente os proxies confiáveis da hospedagem para recuperar o IP
real; não confiar livremente em X-Forwarded-For enviado pelo cliente.

### 10.5 Reproduzir e interpretar os testes

Execute os comandos da seção 7. Não execute `migrate` novamente num banco
já instalado. Os testes sem banco cobrem cookie, hash do token, senha errada,
e-mail inexistente, origem, validação, rate limit por IP/e-mail, quatro perfis
e configuração segura de produção.

Os testes de integração criam duas empresas e um usuário com Argon2id no
MySQL local. Chamam as rotas reais por Supertest e verificam sessão persistida,
último login, revogação, rotação, expiração, desativação, mudança de perfil e
isolamento. Dados têm UUID por execução; a limpeza remove exclusivamente os
IDs criados pelo teste, com cascade das sessões. A base da Fase 1 mantém seu
rollback. Se o processo for interrompido à força, pode restar fixture local;
inspecione o UUID antes de qualquer remoção manual. Aiven e produção são
recusados por estes testes.

Não criamos conta padrão nem carregamos `stma_seed_demo.sql`. Por isso, ainda
não existe um login de demonstração fornecido ao usuário. O cadastro real e
a criação controlada do primeiro administrador serão tratados na Fase 3;
seed demo permanece na Fase 7. A validação da Fase 2 é reproduzível pelos
testes, que criam e removem suas próprias credenciais locais.

Quando existir uma conta cadastrada, este exemplo PowerShell preserva o
cookie sem imprimir sua senha nem token (API local com Secure=false):

```powershell
$credencial = Get-Credential -Message 'Informe e-mail e senha do usuário STMA'
$corpo = @{ email = $credencial.UserName; senha = $credencial.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/api/v1/auth/login -Method Post -ContentType 'application/json' -Body $corpo -SessionVariable sessao
Remove-Variable corpo,credencial
Invoke-RestMethod http://localhost:3000/api/v1/auth/me -WebSession $sessao
Invoke-RestMethod http://localhost:3000/api/v1/auth/logout -Method Post -ContentType 'application/json' -Body '{}' -WebSession $sessao
```

### 10.6 Evidências, pendências e próxima fase

- Local: lint, typecheck, build e 26 testes aprovados (18 sem banco, 8 MySQL).
- Dependências: instalação reportou zero vulnerabilidades.
- GitHub: commit 7d664fe, tag backend-fase-2; CI aprovado: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38314809772
- Aiven: schema preservado, sem fixtures ou usuários criados nesta fase.
- Pendente: Fases 3–7, configuração operacional de produção e frontend.
- Próximo passo após aceite: Fase 3, cadastros com escopo, desativação lógica
  e auditoria. Ingestão MQTT e troca de broker continuam na Fase 4.
- Segundo repositório wxlv7h: destino e acesso ainda pendentes.

Referências técnicas: [node-argon2](https://github.com/ranisalt/node-argon2),
[express-rate-limit](https://github.com/express-rate-limit/express-rate-limit),
[OWASP — sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
e [OWASP — CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## 11. Fase 3 — cadastros, exclusão lógica e auditoria

### 11.1 Requisitos e decisões

Esta etapa implementa RF002–RF007, RN002–RN004 e RN007. A hierarquia é
empresa → unidade → setor → ambiente → dispositivo; usuário pertence à
empresa. Mantivemos o schema definitivo, sem nova migração e sem ORM.

O critério da Fase 3 menciona DELETE, enquanto a convenção usa PATCH com
ativo=false. A API oferece ambos: PATCH é a operação principal e DELETE
é apenas um alias de desativação, retornando o cadastro com ativo=false.
Não executa SQL DELETE, não apaga filhos e não altera dados de telemetria.

Superadmin pode administrar empresas e criar seu primeiro administrador.
Para evitar uma empresa sem responsável, POST /empresas exige o objeto
administrador e grava empresa, usuário e duas auditorias em uma transação.
Administradores de empresa gerenciam seus próprios usuários; não podem criar
superadmin nem transferir um usuário/dispositivo para outra empresa.

Dispositivos pendentes e sua adoção permanecem na Fase 4: dependem da ingestão
e da definição do vínculo de um ID ainda desconhecido. Não criamos endpoints
que exponham a fila global sem uma regra de escopo. Modo demo e eh_demo
continuam na Fase 7. O intervalo do dispositivo é configuração persistida;
esta fase não envia comandos MQTT nem reprograma o firmware.

### 11.2 Sequência de construção e arquitetura

1. Conferimos campos, chaves compostas, CHECKs e limites do schema.
2. Criamos validação por recurso, contratos de persistência e transação.
3. Implementamos serviços de autorização, hierarquia e auditoria.
4. Implementamos o adaptador mysql2 com SQL parametrizado.
5. Montamos controllers e rotas autenticadas, reutilizando a proteção de
   origem e exigência de JSON da Fase 2.
6. Acrescentamos provisionamento CLI do primeiro superadmin.
7. Exercitamos as rotas reais, transações e concorrência com MySQL local.

| Arquivo em backend/src/ | Responsabilidade |
|---|---|
| modules/cadastros/cadastro.validation.ts | Schemas Zod, faixas, paginação e IDs |
| modules/cadastros/cadastro.repository.ts | Contratos de leitura e unidade de trabalho transacional |
| modules/cadastros/cadastro.service.ts | Autorização, regras de vínculo e gravação da auditoria |
| modules/cadastros/mysql-cadastro.repository.ts | SQL e transações; adaptador substituível por Prisma |
| modules/cadastros/cadastro.controller.ts | Entrada/saída HTTP e status |
| modules/cadastros/cadastro.routes.ts | Rotas, sessão, perfis e proteção de escrita |
| modules/cadastros/bootstrap.service.ts | Validar e hashear a senha do primeiro superadmin |
| db/bootstrap.ts | Comando local de provisionamento, sem endpoint público |
| shared/mutation-guard.ts | Origem permitida e Content-Type JSON |
| modules/auth/auth.scope.ts | Regra de escopo independente do Express |

O contrato `transaction(work)` fornece um `CadastroTransaction` ao serviço.
Todas as operações do callback usam a mesma conexão. O serviço decide as
regras, e o adaptador controla beginTransaction/commit/rollback. Uma futura
implementação Prisma precisará preservar esta semântica, além das FKs e
CHECKs; trocar o driver não deve remover garantias de integridade.

Há seis recursos fixos; nomes de tabela/coluna vêm de listas internas.
Nenhum identificador SQL é recebido do cliente. Valores são parametrizados;
campos extras, inclusive empresa_id, senha_hash e valores de telemetria,
são rejeitados na entrada. A projeção SQL de usuários não seleciona senha_hash.

### 11.3 Como ocorre uma escrita segura

1. A sessão fornece usuário, empresa e perfil. As rotas e o serviço verificam
   permissões; a empresa de um cadastro não vem do JSON nem da query string.
2. Zod valida o corpo. Uma senha nova é transformada em Argon2id antes de
   iniciar a transação para não segurar travas durante o cálculo do hash.
3. A transação trava a linha da empresa com SELECT FOR UPDATE. Isso serializa
   mutações daquela empresa e impede desativar pais enquanto se cria um filho.
4. O serviço revalida usuário ativo e perfil e busca o recurso com seu escopo.
   Um ID de outra empresa produz 404, assim como um ID inexistente.
5. Valida pai e ancestrais na mesma empresa. Cadastro ativo exige hierarquia
   ativa. As FKs compostas ainda impedem vínculo cruzado se alguém ignorar a API.
6. Para PATCH de faixas, junta o estado persistido com a alteração antes de
   verificar mínimo/máximo. Um PATCH só do mínimo não pode superar o máximo atual.
7. Grava o cadastro e uma auditoria com ator, IP, ação, antes e depois.
8. Confirma a transação. Se a auditoria falhar, a alteração é desfeita.

Essa trava por empresa simplifica a concorrência neste monólito de portfólio;
ela limita o paralelismo de escritas de uma mesma empresa. Deadlock/timeout
retorna 409 CONCORRENCIA para tentativa posterior, sem sucesso parcial.
Não há promessa de desempenho para grande volume de alterações cadastrais.

Senhas, hashes e tokens nunca aparecem na auditoria nem no JSON de usuários.
Uma alteração de senha registra apenas senha_alterada=true junto ao estado
público. Atualizar senha/e-mail ou desativar usuário revoga suas sessões.
Login revalida o hash da senha dentro da transação: um login iniciado antes
da troca não pode criar sessão depois dela usando a senha antiga.

O último administrador ativo não pode ser desativado ou rebaixado. A checagem
acontece sob a trava da empresa, inclusive quando duas alterações chegam
juntas. Cadastre outro administrador antes de remover esse acesso.

### 11.4 Rotas e respostas

Prefixo comum: `/api/v1`. Todas as escritas exigem JSON e sessão válida.

| Rotas | Quem pode |
|---|---|
| GET/POST /empresas; GET/PATCH/DELETE /empresas/:id | superadmin |
| GET /unidades, /setores, /ambientes, /dispositivos; GET /recurso/:id | administrador, operador e leitor da própria empresa |
| POST /unidades, /setores, /ambientes, /dispositivos; PATCH/DELETE /recurso/:id | administrador da própria empresa |
| GET/POST /usuarios; GET/PATCH/DELETE /usuarios/:id | administrador da própria empresa |
| PATCH /dispositivos/:id/manutencao | administrador ou operador; apenas em_manutencao |

POST retorna 201 com Location e `{ dados: cadastro }`. GET de detalhe e
PATCH/DELETE retornam 200 com o mesmo envelope. Listas retornam
`{ dados: [], pagina: 1, tamanho: 20, total: 0 }`, ordenadas por ID, e aceitam
pagina, tamanho (1–500) e incluir_inativos (`true`/`false`). Parâmetros
desconhecidos são recusados, evitando filtros que pareçam funcionar sem efeito.

O detalhe pode mostrar um registro inativo da própria empresa; a lista o
oculta por padrão. Desativar um pai preserva os filhos e seus flags. Criar,
mover ou reativar um filho ativo sob pai/ancestral inativo retorna 409.
Não há cascata automática de flags: a interface futura deverá explicar a
hierarquia inativa. Reativar empresa restaura a elegibilidade das sessões
ainda não expiradas/revogadas, conforme a regra da Fase 2.

Erros: 400 para validação, 401 sem sessão, 403 sem permissão/origem indevida,
404 para vínculo/recurso não encontrado no escopo, 409 para duplicidade,
hierarquia inativa, último administrador ou concorrência; 415 sem JSON.
O erro de duplicidade não revela qual registro de outra empresa existe.

### 11.5 Campos e exemplos de corpos

Os exemplos abaixo são JSON para estudo; substitua nomes, IDs e credenciais.
Não use as senhas de exemplos como credenciais reais.

```json
{
  "nome": "Empresa de exemplo",
  "cnpj": null,
  "administrador": {
    "nome": "Administrador da empresa",
    "email": "admin@example.com",
    "senha": "SUBSTITUA-POR-SENHA-PRIVADA"
  }
}
```

Esse é o corpo de POST /empresas por superadmin. Depois, faça login com o
administrador criado para cadastrar a hierarquia:

| POST | Corpo de exemplo |
|---|---|
| /unidades | `{"nome":"Matriz","endereco":null,"fuso_horario":"America/Bahia"}` |
| /setores | `{"nome":"Produção","unidade_id":1}` |
| /ambientes | `{"nome":"Sala elétrica","setor_id":1,"temp_min_ideal":18,"temp_max_ideal":28,"umid_max_ideal":70,"temp_tolerancia":2}` |
| /dispositivos | `{"ambiente_id":1,"device_id":"esp32-sala-01","sensor":"DHT22","intervalo_leitura_seg":30,"offline_apos_seg":120}` |
| /usuarios | `{"nome":"Operador","email":"operador@example.com","senha":"SUBSTITUA-POR-SENHA-PRIVADA","perfil":"operador"}` |

Use os IDs realmente retornados pela API. Faixas são opcionais e aceitam
null; temperaturas ficam entre -50 e 100 e umidades entre 0 e 100, com uma
casa decimal. Tolerâncias: 0–99,9. Intervalo: 2–3600 segundos (padrão 30);
offline: 10–86400 (padrão 120). Sensores: DHT11, DHT22, SHT31 ou OUTRO.
device_id: 3–64 caracteres minúsculos, números, hífen e sublinhado.

CNPJ aceita null ou o formato do CHECK do schema: 12 caracteres numéricos
ou letras maiúsculas, seguidos de dois dígitos. Esta validação é de formato,
não comprova existência nem situação cadastral. O fuso é validado com Intl;
horários no banco continuam UTC. Campos omitidos mantêm os defaults do schema.

Exemplos de alteração com a sessão PowerShell obtida na seção 10.5:

```powershell
# Substitua 1 pelo ID real retornado no seu cadastro.
Invoke-RestMethod http://localhost:3000/api/v1/ambientes/1 -Method Patch -ContentType 'application/json' -Body '{"temp_max_ideal":29}' -WebSession $sessao
Invoke-RestMethod http://localhost:3000/api/v1/dispositivos/1/manutencao -Method Patch -ContentType 'application/json' -Body '{"em_manutencao":true}' -WebSession $sessao
Invoke-RestMethod http://localhost:3000/api/v1/unidades/1 -Method Delete -ContentType 'application/json' -Body '{}' -WebSession $sessao
Invoke-RestMethod 'http://localhost:3000/api/v1/unidades?incluir_inativos=true' -WebSession $sessao
Invoke-RestMethod http://localhost:3000/api/v1/unidades/1 -Method Patch -ContentType 'application/json' -Body '{"ativo":true}' -WebSession $sessao
```

### 11.6 Primeiro acesso: provisionar superadmin

1. Instale o schema se o banco estiver vazio. Em banco já instalado, use
   `db:check`; não reaplique a migração 001.
2. Preencha BOOTSTRAP_NAME, BOOTSTRAP_EMAIL e BOOTSTRAP_PASSWORD somente em
   backend/.env. Senha: 12–128 caracteres. Arquivo ignorado pelo Git.
3. Confira DB_TARGET e execute `npm --prefix backend run auth:bootstrap`.
4. O comando cria a conta e a auditoria, com empresa_id NULL e perfil
   superadmin. Imprime somente resultado, destino e ID; não imprime senha/hash.
5. Para outro banco, altere DB_TARGET e repita. São contas independentes;
   nenhuma sincronização de usuários ou senhas acontece entre bancos.
6. Remova BOOTSTRAP_PASSWORD do arquivo após concluir nos destinos desejados.
7. Inicie a API, faça login como superadmin e crie a empresa com seu primeiro
   administrador. Use esse administrador para os demais cadastros.

O comando usa trava nomeada por banco, transação e verificação de existência.
Se já houver qualquer superadmin (mesmo inativo), recusa alterar/criar contas.
Não é um comando de recuperação de senha. Não existe rota pública de bootstrap.
Esse provisionamento administrativo é diferente do seed demo da Fase 7.

### 11.7 Testes, evidências e pendências

Execute os comandos da seção 7. As fixtures de cadastro usam UUID e são
removidas por IDs de empresas criadas exclusivamente pelo teste, em ordem
compatível com as FKs; o teste nunca limpa uma empresa preexistente.

Cobertura da Fase 3: seis cadastros, CRUD lógico, consulta/alteração de IDs de
outra empresa, FKs compostas, validação de faixas no PATCH, perfis, manutenção,
tentativa de atribuir campos protegidos, paginação, duplicidade, rollback de
empresa/admin e rollback quando auditoria falha. Testamos ainda revogação por
senha e duas desativações concorrentes preservando o último administrador.
Bootstrap é testado para validação/hash e recusa de conta já existente.

A primeira execução encontrou comparação estrita entre número e texto no
resultado de GET_LOCK, pois o pool preserva inteiros grandes como texto.
A conversão foi corrigida e a suíte foi reexecutada; não registramos essa
primeira execução como aprovada.

| Validação desta fase | Resultado |
|---|---|
| ESLint, TypeScript e build | Aprovados |
| Testes sem banco | 23 aprovados |
| Integração MySQL real | 22 aprovados |
| Superadmin solicitado | Criado no MySQL local e no Aiven |
| Primeiro acesso local e Aiven | Login 200, me 200, logout 204 e sessão revogada 401 |
| Conexão Aiven no primeiro acesso | TLS ativo |
| Segredo temporário BOOTSTRAP_PASSWORD | Esvaziado no .env após validar os dois bancos |
| GitHub/CI | Publicação e validação remota em andamento |

O superadmin real foi criado somente após o proprietário informar nome,
e-mail e destinos, e confirmar a senha no arquivo local. Não publicamos
credenciais. Nenhuma empresa, fixture ou usuário demo foi criado no Aiven.
O login verificado gerou uma sessão real que terminou revogada pelo logout.

Falta: Fases 4–7 e frontend. Próxima etapa após aceite: ingestão MQTT com
broker selecionável por configuração, validação, idempotência e persistência.
Antes dela, esclarecer timestamps/duplicatas e o escopo de adoção dos IDs
pendentes. Publicação em wxlv7h segue pendente de destino e acesso.
