# Roteiro didático do backend STMA

Início: 12/10/2026. Fases 1 e 2 concluídas. **Fase 3 — Cadastros e auditoria**
concluída com testes locais e CI aprovados. Registros nas seções 10 e 11.
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

Registro histórico da entrega da Fase 2. As pendências descritas nesta seção
foram atualizadas na seção 11, que inclui cadastros e o primeiro acesso real.

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
| GitHub/CI | Aprovado: execução 38316891647, commit 28b071d, tag backend-fase-3 |

O superadmin real foi criado somente após o proprietário informar nome,
e-mail e destinos, e confirmar a senha no arquivo local. Não publicamos
credenciais. Nenhuma empresa, fixture ou usuário demo foi criado no Aiven.
O login verificado gerou uma sessão real que terminou revogada pelo logout.

Evidência remota: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38316891647

Falta: Fases 4–7 e frontend. Próxima etapa após aceite: ingestão MQTT com
broker selecionável por configuração, validação, idempotência e persistência.
Antes dela, esclarecer timestamps/duplicatas e o escopo de adoção dos IDs
pendentes. Publicação em wxlv7h segue pendente de destino e acesso.

## 12. Fase 4 — ingestão implementada; validação do ESP32 pendente

### 12.1 Decisões confirmadas pelo proprietário

- Aceitar mensagens sem timestamp usando a hora de recebimento. Deduplicar por dispositivo e timestamp válido; valores iguais isoladamente não identificam uma retransmissão.
- Somente superadmin lista a fila global e adota dispositivos, escolhendo o ambiente de destino. Um administrador de empresa não pode acessar dispositivos ainda sem empresa.
- Validar o equipamento físico com o HiveMQ disponível ao proprietário. Dois brokers Mosquitto locais servem à automação dos testes, sem definir o fornecedor de produção.

### 12.2 Caminho da mensagem e responsabilidades

1. `src/config/mqtt.ts` valida URL, credenciais, client ID, prefixo e tempos. `MQTT_ENABLED=false` mantém a ingestão desligada por padrão.
2. `mqtt-consumer.ts` encapsula MQTT.js e assina `<prefixo>/+/dados`, `/status` e `/porta`. Nenhuma regra de negócio depende de SDK do HiveMQ.
3. `telemetry.service.ts` valida tópico, identidade, JSON, campos e limites; normaliza valores e horário. Não executa SQL.
4. `telemetry.repository.ts` define o contrato de persistência. `mysql-telemetry.repository.ts` implementa transações parametrizadas com mysql2. Uma versão Prisma poderá substituir esse repositório preservando o serviço.
5. `main.ts` compõe as dependências, inicia o consumidor quando habilitado e o encerra antes de fechar o pool MySQL.

O banco resolve a empresa e o ambiente pelo dispositivo cadastrado. O payload não pode escolher empresa. A transação grava histórico e estado atual juntos; falha faz rollback. Leituras atrasadas entram no histórico sem fazer a última leitura retroceder. Dispositivo ou ancestral inativo não é reativado por telemetria.

### 12.3 Contrato MQTT

Tópico de exemplo: `engeasier/esp32_01/dados`.

```json
{"id":"esp32_01","temperatura":22.5,"umidade":55,"timestamp":"2026-10-12T15:00:00.000Z"}
```

Use o horário real da medição; o exemplo é ilustrativo. `dispositivo` pode substituir `id`; se ambos existirem, ambos devem coincidir com o tópico. Identificadores usam letras minúsculas, números, `_` e `-`, com 3 a 64 caracteres. Temperatura aceita -50 a 100 °C e umidade 0 a 100%; valores são normalizados para uma casa decimal. Campos extras, identidade divergente e JSON inválido são descartados. O limite de payload é 32 KiB.

Timestamp aceita RFC3339 com fuso e até três casas de milissegundos. Ausente, inválido ou fora da janela configurada usa recebimento. A janela padrão aceita até 168 horas de atraso e 60 segundos no futuro. Portanto, a deduplicação só é garantida com timestamp válido dentro dessa janela; retransmissões sem horário ou muito antigas não têm essa garantia. Mesmo dispositivo/horário com valores diferentes gera conflito e preserva a primeira leitura.

`/status` aceita `online`/`offline` ou JSON com `status`. `/porta` aceita ABERTA/FECHADA, Porta Aberta/Porta Fechada, ABERTO/FECHADO, OPEN/CLOSED, 1/0 ou JSON `{"aberta":true}`. Porta usa hora de recebimento e grava mudanças de estado. Dados e porta retidos são recusados; status online retido não comprova presença atual. LWT offline não inventa novo horário de contato.

### 12.4 Confirmação, falhas e reconexão

O adaptador usa MQTT 3.1.1, sessão persistente, client ID estável e assinatura QoS 1. `handleMessage` posterga o PUBACK até o serviço terminar. Erro de banco interrompe a conexão sem confirmar a mensagem, permitindo reentrega. Mensagem inválida é descartada e confirmada para não bloquear a fila indefinidamente.

Essa estratégia foi exercitada com falha antes da gravação, falha depois do commit, reconexão e publicação enquanto o consumidor estava desconectado. Não é uma promessa de entrega exatamente uma vez em qualquer situação: exige publicador QoS 1, sessão/fila preservada pelo broker e capacidade de armazenamento disponível. Assinar QoS 1 não transforma publicação QoS 0 em QoS 1. Confira a biblioteca do ESP32; o método comum de publicação de PubSubClient usa QoS 0.

### 12.5 Dispositivos desconhecidos e adoção

IDs desconhecidos atualizam `dispositivo_pendente`, contador e último payload normalizado. Não criam leituras nem empresa automaticamente.

- `GET /api/v1/dispositivos-pendentes`: sessão de superadmin, paginação e filtro `situacao` (padrão `pendente`).
- `POST /api/v1/dispositivos-pendentes/:id/adotar`: sessão de superadmin e corpo como `{"ambiente_id":123,"sensor":"DHT22","nome":"Sensor sala"}`.

A adoção valida hierarquia ativa, cria o dispositivo, marca a pendência como adotada e registra duas auditorias na mesma transação. Não importa retroativamente o último payload da fila; as próximas publicações passam a gerar leituras. Administrador recebe 403; adoção repetida recebe 409. Não houve alteração do schema de 13 tabelas.

### 12.6 Executar e trocar brokers

Na raiz do projeto, o broker local de desenvolvimento pode ser iniciado com:

```powershell
docker compose -f compose.mqtt.yaml up -d --wait
```

Configure no arquivo `backend/.env`:

```dotenv
MQTT_ENABLED=true
MQTT_URL=mqtt://127.0.0.1:18884
MQTT_CLIENT_ID=stma-backend-local
MQTT_TOPIC_PREFIX=engeasier
MQTT_USERNAME=
MQTT_PASSWORD=
```

O Mosquitto de teste fica restrito ao loopback e não atende o ESP32 pela rede. O backend só aceita MQTT sem TLS em loopback fora de produção. Em broker remoto use `mqtts://HOST:PORTA`, credenciais e, quando necessária, CA em `MQTT_CA_FILE`. Não desative a verificação do certificado.

```powershell
npm --prefix backend run mqtt:check
npm --prefix backend run dev
# Em outro terminal, apenas em ambiente destinado à demonstração:
npm --prefix backend run mqtt:publish -- --device esp32_01 --temperature 22.5 --humidity 55
```

`mqtt:check` usa client ID temporário, conecta e verifica assinaturas, sem gravar no banco. Os dois comandos explícitos de MQTT aplicam as regras de segurança mesmo quando a ingestão da API está desabilitada. `mqtt:publish` envia QoS 1 sem retain; sua confirmação indica recebimento pelo broker, não commit no MySQL. Para credenciais separadas, preencha `MQTT_PUBLISH_USERNAME` e `MQTT_PUBLISH_PASSWORD` apenas no `.env` local.

Para trocar HiveMQ, Mosquitto ou outro broker MQTT compatível, altere URL, credenciais e CA e reinicie o backend. Cada instalação precisa de client ID exclusivo e estável. Configure o ESP32 no mesmo destino e mantenha tópicos/payloads compatíveis. Sessões, filas e mensagens retidas do broker anterior não são migradas pelo `.env`. O destino do banco continua independente: `DB_TARGET=local` ou `aiven`.

Guia específico: [Configuração HiveMQ e validação física](roteiro-hivemq-fase4.md).

### 12.7 Testes e pendências

Os testes de banco e MQTT usam exclusivamente MySQL local, fixtures com identificadores próprios e remoção dos registros criados. Nenhuma fixture desta fase foi enviada ao Aiven.

```powershell
docker compose -f compose.mqtt.yaml --profile test up -d --wait
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend test
$env:NODE_ENV='test'
$env:DB_TARGET='local'
npm --prefix backend run test:integration
npm --prefix backend run test:mqtt
Remove-Item Env:NODE_ENV
Remove-Item Env:DB_TARGET
npm --prefix backend run build
```

As suítes cobrem normalização, transação, duplicata, conflito, concorrência, atraso, hierarquia inativa, adoção auditada, isolamento de permissões, falhas de persistência, fila offline, LWT, porta e troca entre dois endpoints de broker. O CI passa a subir esses brokers para repetir os testes.

Pendente para concluir a fase: confirmar modalidade/endpoint do HiveMQ, ajustar o firmware real ao contrato, configurar credenciais localmente e validar ESP32 → broker → backend → MySQL no destino acordado. A conexão MQTT TLS externa ainda não foi comprovada. `/health` verifica o banco; não certifica a prontidão MQTT. Verifique `mqtt:check` e o evento de assinatura nos logs.

As Fases 5–7 e o frontend permanecem não iniciados. A tag de conclusão da Fase 4 depende dessa validação e do aceite. A publicação no segundo repositório depende de URL e acesso.

Validação local executada: ESLint, TypeScript e build aprovados; 36 testes unitários/HTTP, 31 de integração MySQL e 8 de integração MQTT aprovados (75 no total). CI remoto aprovado no commit 4c668dc: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38320360868. A repetição dos testes afetados pelo formato de porta também foi aprovada.

O proprietário confirmou broker público broker.hivemq.com e payload identificado compatível sem timestamp, QoS 0. O firmware colado difere do tráfego observado; localização do .ino atual e modalidade do broker da conta permanecem pendentes. Formatos Porta Aberta/Porta Fechada foram incorporados ao contrato e aos testes.

### Atualização: broker Lab identificado e conexão validada

O proprietário confirmou HiveMQ Software, nome Lively Honey, pacote Lab. Foi encontrado o contêiner local hivemq em execução, publicando MQTT em 1883 e Control Center em 8080. O diagnóstico mqtt:check, com MQTT_URL=mqtt://127.0.0.1:1883 somente no ambiente do comando, conectou e obteve as três assinaturas QoS 1. TLS não foi usado porque a conexão foi loopback local. O arquivo .env não foi alterado e o diagnóstico não gravou telemetria.

A modalidade e o endpoint local estão confirmados. Ainda falta localizar o .ino efetivamente em uso, apontar ESP32 e backend ao mesmo broker e validar a leitura física no banco/ambiente escolhido. O ESP32 deve usar o IPv4 da máquina na mesma rede, porta 1883; localhost na placa apontaria para a própria placa. O computador e o Docker precisam permanecer ligados. Não foi criado serviço Cloud nem contratado plano.

### Firmware localizado e cópia preparada

O sketch atual mqtt_esp32_aula_pub foi lido no caminho indicado pelo proprietário. Ele gera o ID a partir do MAC e publica o JSON esperado em /dados; o comando de LED usa /comando. Foi criada a cópia firmware/mqtt_esp32_stma, preservando pinos, mensagens e comportamento. Wi-Fi e host/porta foram separados em config.h ignorado pelo Git, com modelo público config.example.h. Host local observado: 192.168.0.102:1883 para a placa; backend no mesmo PC usa 127.0.0.1:1883.

O original foi preservado. Sem compilador arduino-cli disponível no PATH, não foi confirmada compilação desta cópia. Faltam selecionar placa/COM, verificar e carregar pela Arduino IDE, conferir mensagens no HiveMQ local e validar adoção/persistência no banco escolhido. Fase 4 continua aberta. Instruções em firmware/mqtt_esp32_stma/README.md.

### Compilação física — ESP32 Dev Module / COM13

O proprietário confirmou ESP32 Dev Module, COM13, USB e mesma rede Wi-Fi. Autorizou MySQL local e hierarquia Laboratório STMA → Bancada → Testes → Bancada ESP32, com DHT11.

Foi localizado o arduino-cli incluído na Arduino IDE. A compilação com esp32:esp32:esp32 e as bibliotecas Arduino locais foi aprovada: 902380 bytes de programa (68%) e 47328 bytes de RAM (14%). A tentativa de upload falhou ao abrir COM13, com acesso negado/porta ocupada ou indisponível; não houve confirmação de gravação. Solicitado fechar Monitor Serial/Plotter e outros clientes seriais antes de tentar novamente.

Próximo passo: liberar COM13, repetir upload e validar mensagens reais no HiveMQ local; somente depois provisionar a hierarquia autorizada e confirmar a persistência. Nenhum cadastro demonstrativo ou leitura física foi criado nesta tentativa. Fase 4 permanece aberta.

## Encerramento técnico da Fase 4 — 12/10/2026 (America/Bahia)

**Concluída e validada com o ESP32 físico.** Os registros anteriores de COM13 ocupada e validação pendente são históricos e foram resolvidos. A Fase 5 não foi iniciada.

1. Após fechar a Arduino IDE, o upload na COM13 concluiu, verificou o hash e reiniciou a ESP32-D0WD, MAC correspondente ao device_id esp32-a8032a1e7214.
2. A placa publicou no HiveMQ Software/Lab local, porta 1883. O consumidor identificou o dispositivo desconhecido e gravou a pendência no MySQL local.
3. Com autorização do proprietário, foram criados Laboratório STMA (empresa 47), Bancada, Testes e Bancada ESP32 (ambiente 25), usando os serviços de cadastro e auditoria. O DHT11 foi adotado pelo serviço de adoção com o superadmin local (dispositivo 25).
4. Foram confirmadas três leituras físicas de 28,6 °C e 66% às 00:26:06.224, 00:26:08.271 e 00:26:10.216 UTC de 13/10 (21:26 do dia 12 em America/Bahia). Timestamp foi atribuído no recebimento, conforme contrato aprovado.
5. O processo normal do backend foi iniciado com MQTT_ENABLED=true, MQTT_URL=mqtt://127.0.0.1:1883 e DB_TARGET=local. O histórico passou de 9 para 12 registros em seis segundos; dispositivo online, pendência adotada e última leitura 28,7 °C/66%. GET /health retornou status ok e database up.

O backend permanece em execução nesta sessão na porta 3000, ingerindo as mensagens da placa. Para iniciar após encerrar a sessão: na raiz do projeto, npm --prefix backend start. Não execute outra instância com o mesmo client ID. O HiveMQ e o MySQL precisam permanecer ligados.

A credencial aleatória do administrador de demonstração admin.lab@stma.invalid está somente em backend/.env.lab, ignorado pelo Git. O superadmin existente foi preservado. Aiven não recebeu estes cadastros nem leituras. O script operacional de validação está em backend/.local, ignorado, e não deve ser reexecutado para duplicar a hierarquia.

Evidências complementares: 75 testes locais e CI do código 4c668dc aprovados; firmware compilado (68% programa, 14% RAM). Esta validação física comprova fluxo local QoS 0 sem timestamp do produtor. Reentrega e deduplicação com timestamp foram comprovadas separadamente pelos testes QoS 1; TLS MQTT remoto não foi testado, pois o broker escolhido é local. Não houve teste de atuação física da porta nem comando remoto ao LED nesta sessão.

Próximo passo: aceite do proprietário para iniciar a Fase 5 (leituras, painel e alertas). Fases 5–7 e frontend continuam não iniciados. Publicação em wxlv7h permanece dependente de URL e acesso ao segundo repositório.

## 13. Fase 5 — concluída em 13/10/2026

### 13.1 Política de alertas

alert-policy.ts contém funções puras, sem SQL, HTTP ou MQTT. Valores iguais aos limites são normais. Violação até a tolerância é atenção; acima dela é crítica. Tolerância nula equivale a zero. Limite nulo não impõe restrição daquele lado. A comparação em décimos evita imprecisão binária nos limites decimais do schema. O episódio conserva o pior valor e não reduz a maior severidade já atingida.

O proprietário confirmou os limites de 31 dias para histórico/CSV e 366 dias para a série por hora, calculada das leituras nesta fase. Também confirmou que leituras atrasadas não alteram episódios atuais. A política foi integrada à transação de ingestão.

### 13.2 Painel e reconhecimento

monitoring.repository.ts define o contrato; monitoring.service.ts aplica validação e autorização; mysql-monitoring.repository.ts implementa SQL parametrizado; monitoring.routes.ts recebe HTTP. app.ts e main.ts compõem as dependências.

- GET /api/v1/painel: usa vw_ambiente_estado e filtra a empresa da sessão e os ancestrais ativos. Não aceita empresa_id enviado pelo cliente.
- GET /api/v1/alertas: pagina/tamanho, máximo 500; situacao aberto (padrão), encerrado ou todos. Mantém alertas históricos mesmo se o cadastro ficar inativo. Complemento da Fase 5 do frontend (17/10/2026): filtro opcional ambiente_id, aplicado no SQL junto à empresa da sessão, e campo ambiente com o nome na listagem. Cinco testes de integração MySQL aprovados, incluindo isolamento entre empresas com esse filtro; sem alteração de schema.
- POST /api/v1/alertas/:id/reconhecer: operador/administrador, JSON vazio e mesma origem; leitor não escreve. Revalida empresa e perfil dentro da transação, trava o episódio, registra autor e horário e grava auditoria. Repetição preserva o primeiro reconhecimento. Reconhecer não fecha o alerta.

IDs BIGINT de alertas são tratados como texto para não perder precisão. Uma empresa não consulta nem reconhece alertas alheios; o recurso alheio responde 404. Superadmin não ganha acesso implícito aos dados internos de uma empresa.

### 13.3 Histórico, CSV e série por hora

`history.repository.ts` define o contrato de consulta; `history.service.ts` valida período e escopo; `mysql-history.repository.ts` usa SQL parametrizado; `history.routes.ts` entrega JSON ou CSV. Nenhuma regra de consulta conhece HiveMQ ou outro fornecedor MQTT.

| Endpoint | Comportamento |
|---|---|
| GET /api/v1/ambientes/:id/leituras?de&ate&pagina&tamanho | Histórico paginado, até 31 dias, tamanho máximo 500; ordem por medido_em e id decrescentes |
| GET /api/v1/ambientes/:id/leituras.csv?de&ate | Todas as leituras do período, até 31 dias, em lotes de 500 e ordem cronológica |
| GET /api/v1/ambientes/:id/serie?de&ate | Média, mínimo, máximo e quantidade por hora UTC; até 366 dias |

`de` e `ate` são obrigatórios em RFC3339 com fuso, por exemplo `2026-10-13T00:00:00Z`. O intervalo inclui `de` e exclui `ate`, permitindo juntar períodos sem repetir a leitura da fronteira. Período inválido ou excessivo recebe 400; histórico acima de 31 dias orienta usar `/serie`. A API não troca silenciosamente o formato de histórico pelo de série.

O histórico é filtrado pelo ambiente registrado na leitura, preservando a rastreabilidade quando um dispositivo muda de ambiente. Ambiente de outra empresa recebe 404; cadastros desativados continuam consultáveis no histórico da própria empresa.

O CSV contém data_hora_utc, temperatura_c, umidade_pct, dispositivo_id e leitura_id. Não inclui textos livres de cadastros. A exportação usa cursor por horário/ID e um ID máximo capturado no início para excluir novas inserções usuais. Isso não representa um snapshot transacional longo: uma futura rotina de exclusão concorrente pode remover linhas durante a exportação. O servidor libera a conexão SQL a cada lote, respeita a vazão da resposta HTTP e revalida a sessão por lote. Desconexão cancela a iteração; falha depois dos cabeçalhos interrompe a resposta, em vez de anexar JSON a um CSV.

A série agrupa as leituras brutas por hora e não inventa pontos para horas sem dados. A resposta declara `fonte: leituras_brutas` e `granularidade: hora`. Horas inicial/final parciais representam somente o intervalo solicitado. O cálculo não grava em `leitura_hora`: materialização, retomada de 48 h e expurgo continuam na Fase 6.

### 13.4 Episódios na transação da ingestão

Depois de inserir uma leitura nova, a ingestão verifica se ela avança o estado atual do dispositivo. Somente nesse caso chama `persistAlertEpisodes`, na mesma conexão e transação. Temperatura e umidade são avaliadas separadamente.

- Fora da faixa sem episódio aberto: cria o episódio vinculado à primeira leitura e ao ambiente.
- Fora da faixa no mesmo sentido/ambiente: preserva o primeiro valor/limite e atualiza o extremo e a maior severidade.
- Volta à faixa: registra o encerramento no horário da medição.
- Passagem direta de acima para abaixo (ou vice-versa): encerra o anterior e abre outro no novo sentido.
- Mudança de ambiente: a próxima leitura atual encerra o episódio antigo e avalia o novo ambiente, sem reescrever o vínculo histórico.
- Retransmissão duplicada não cria outro episódio. Leitura atrasada entra no histórico sem mudar o episódio atual.

A trava já existente da empresa/dispositivo serializa a decisão e evita abertura concorrente duplicada, sem alterar o schema. Falha posterior à criação do alerta faz rollback de leitura, alerta e última leitura. Alterar faixas no cadastro produz efeito na próxima medição atual; não reconstrói alertas antigos. O indicador de manutenção permanece informativo, sem regra adicional de supressão de alertas nesta fase.

### 13.5 Atualização autenticada por SSE

`GET /api/v1/stream` exige sessão de administrador, operador ou leitor vinculada a uma empresa. `createStreamHub` distribui somente avisos da mesma empresa; o navegador não se conecta ao broker.

O evento `atualizar` contém `{"reconsultar":true}`. O cliente deve consultar novamente painel/alertas/histórico autorizados. O aviso é emitido depois do commit da ingestão, inclusive quando uma leitura histórica é acrescentada, e nunca após rollback ou duplicata. Falha de observador não transforma um commit bem-sucedido em falha MQTT.

O stream envia um comentário de batimento a cada 25 segundos e revalida a sessão antes de eventos e batimentos. Revogação, expiração, mudança de empresa/perfil ou indisponibilidade da autenticação fecha a conexão. Clientes lentos são desconectados em vez de acumular fila ilimitada; há limite de 50 conexões por empresa e 500 no processo. Reconexão indica nova consulta ao painel, sem replay persistido de eventos. O desligamento da aplicação fecha streams antes de fechar o pool SQL.

Este hub é local ao processo, coerente com o monólito definido no plano. Escala para múltiplas instâncias exige distribuição de eventos entre processos em evolução futura. Reconhecimento retorna seu estado pela própria API; os avisos de ingestão subsequentes também permitem atualizar outras telas.

### 13.6 Exercitar as APIs em PowerShell

Use uma conta da empresa; superadmin não possui acesso implícito ao painel. A conta de laboratório criada na Fase 4 tem sua credencial somente em `backend/.env.lab` local.

```powershell
$credencial = Get-Credential -UserName 'admin.lab@stma.invalid' -Message 'Administrador do laboratório STMA'
$login = @{ email = $credencial.UserName; senha = $credencial.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/v1/auth/login' -ContentType 'application/json' -Body $login -SessionVariable stmaSessao
$login = $null
Invoke-RestMethod 'http://localhost:3000/api/v1/painel' -WebSession $stmaSessao
# Ajuste ambiente e período conforme os dados existentes. O laboratório usa ambiente 25.
Invoke-RestMethod 'http://localhost:3000/api/v1/ambientes/25/leituras?de=2026-10-13T00:00:00Z&ate=2026-10-14T00:00:00Z&tamanho=20' -WebSession $stmaSessao
Invoke-WebRequest 'http://localhost:3000/api/v1/ambientes/25/leituras.csv?de=2026-10-13T00:00:00Z&ate=2026-10-14T00:00:00Z' -WebSession $stmaSessao -OutFile "$env:TEMP\stma-leituras.csv"
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/v1/auth/logout' -ContentType 'application/json' -Body '{}' -WebSession $stmaSessao
```

O exemplo pressupõe cookie local sem Secure, já configurado em desenvolvimento; produção exige HTTPS e cookie Secure. Para testar alertas sem modificar faixas da bancada real, use a suíte automatizada, que cria e remove seus próprios ambientes.

### 13.7 Validação e próximos passos

Os testes acrescentados cobrem limites inclusivos de severidade, episódios por tipo/sentido, concorrência, atraso, mudança de ambiente, rollback, notificação posterior ao commit, consulta isolada, CSV, agregação por hora, períodos máximos e revogação SSE. O teste de carga cria 100.000 leituras em uma empresa exclusiva de teste no MySQL local, consulta via HTTP as páginas inicial e final e confere 100.001 linhas no CSV (cabeçalho mais leituras). Nenhum dado de teste é enviado ao Aiven.

As tentativas iniciais apresentaram ECONNRESET e, na execução paralela, timeouts inclusive em testes antigos. A suíte passou a manter um servidor HTTP ativo e um cliente sem reaproveitamento de conexões; os arquivos de integração executam sequencialmente para não disputar o MySQL com a carga. Os testes internos de concorrência permanecem paralelos. A limpeza de 100 mil registros ganhou prazo próprio, sem relaxar o limite de 3 s da consulta. Na execução isolada corrigida, página 1: 127 ms; página 200: 1.248 ms, ambas com 500 leituras, abaixo dos 3 s exigidos. CSV completo aprovado. Esses números são evidências do ambiente local, não garantia universal de latência.

Validação conjunta e CI desta entrega aprovados; evidências na seção 13.8. Não há alteração de schema nesta fase. Próxima fase, somente após aceite: rotinas de resumo, offline, expurgo e limpeza de sessões. Frontend e demonstração pública permanecem fora desta entrega.

A execução conjunta corrigida passou: 42 testes MySQL e 43 testes sem banco. Testes são restritos a MySQL local. Falhas das tentativas anteriores não foram contabilizadas como aceite.

### 13.8 Validação final local — 13/10/2026

Lint, TypeScript e build aprovados. Total: 94 testes (43 sem banco, 42 MySQL e 9 MQTT). O teste adicional com broker real abriu e fechou episódio e confirmou a notificação da empresa após commit.

Backend recompilado e reiniciado na porta 3000 com MySQL local e HiveMQ local. A primeira troca de processo falhou porque a versão antiga continuava ocupando a porta; foi corrigida antes do aceite. Checagem autenticada da versão nova: login 200, painel 200 (1 ambiente), alertas 200, histórico 200 (4.562 leituras), série 200 (4 horas com dados), CSV 200 (4.563 linhas com cabeçalho), SSE 200 com aviso inicial, logout 204. Nenhum limite de alerta foi inventado para a bancada real; os episódios foram exercitados em fixtures próprias dos testes.

CI aprovado no commit 3281f01: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38445259187. Tag de conclusão: backend-fase-5.

Na última observação da bancada, o dispositivo estava offline e o total permaneceu em 4.562 leituras; não foi alegada nova coleta física nessa checagem. As APIs foram verificadas com o histórico existente. O backend da Fase 5 está ativo na porta 3000 e conectado ao HiveMQ local. Os testes MQTT da nova versão validaram ingestão e episódios com publicador controlado. O Aiven não foi alterado.

Próximo passo após aceite: Fase 6. Não foram antecipados agendamentos, expurgo, frontend ou deploy de produção. A publicação em wxlv7h continua pendente de URL e acesso.

## 14. Fase 6 — rotinas agendadas (concluída em 14/10/2026)

### 14.1 Objetivo e separação de responsabilidades

A Fase 5 terminou com 94 testes e CI aprovados. Nesta etapa, o backend passa a cuidar do ciclo de vida dos dados: produzir resumos duráveis, detectar ausência de contato e remover registros cuja retenção terminou. O schema de 13 tabelas permanece igual e o acesso continua com mysql2, sem ORM.

O módulo `backend/src/modules/maintenance` separa três responsabilidades:

1. `maintenance.service.ts` calcula os intervalos em UTC e aplica as regras de 48 horas, 90 dias e 30 dias. Recebe relógio e repositório por dependência, permitindo testes sem esperar dias reais.
2. `mysql-maintenance.repository.ts` executa SQL parametrizado, transações e locks. A futura substituição por Prisma deve preservar o contrato e essas garantias.
3. `scheduler.ts` usa node-cron para chamar o serviço nos horários definidos. Não contém SQL nem regra de autorização HTTP.

`main.ts` compõe as dependências e conecta a mudança de offline ao hub SSE. A API e o consumidor MQTT continuam no mesmo processo.

### 14.2 Habilitar as rotinas

No arquivo privado `backend/.env`, confira primeiro o destino do banco e acrescente:

```dotenv
DB_TARGET=local
JOBS_ENABLED=true
```

Reinicie o backend para aplicar. `JOBS_ENABLED=false` desliga os agendamentos; esse é o padrão do exemplo para que copiar uma configuração não inicie exclusões sem revisar o destino. A mudança para Aiven usa os mesmos campos `DB_AIVEN_*` já documentados. Não há fallback para outro banco. A validação desta fase usa MySQL local; não execute fixtures no Aiven.

| Rotina | Quando executa | Resultado |
|---|---|---|
| Resumo | Inicialização e minuto zero de cada hora UTC | Recalcula as últimas 48 horas completas, incluindo a hora anterior |
| Offline | A cada minuto | Online e ativo, com contato estritamente anterior ao prazo individual, passa a offline |
| Expurgo | 03:00, America/Bahia | Resume e remove horas completas anteriores a 90 dias |
| Sessões | 03:30, America/Bahia | Remove sessão cuja expiração ou revogação ocorreu há mais de 30 dias |

Recalcular 48 horas também na execução horária repara atrasos recentes. Leituras mais atrasadas continuam corretas na série, que prefere os dados brutos disponíveis; antes do expurgo, a hora é sempre recalculada. A hora atual não é materializada. Os horários da madrugada usam o fuso IANA explícito, independentemente do fuso do computador; datas armazenadas continuam em UTC.

O log informa o nome da rotina, duração, linhas afetadas e se outra execução já detinha o lock (`skipped`). Em resumos, `affected` segue a contagem do MySQL para INSERT/UPDATE, não é quantidade de sensores. Erros não serializam mensagens SQL que possam conter dados privados. Uma falha não derruba o servidor; a agenda seguinte tenta novamente.

### 14.3 Concorrência e encerramento

`GET_LOCK(nome, 0)` impede duas instâncias de executar a mesma manutenção ao mesmo tempo. O nome inclui hash do banco, e resumo/expurgo compartilham a mesma trava. A aquisição não espera: a execução concorrente registra `skipped`. O lock pertence à conexão, então é liberado explicitamente no `finally`, antes de devolver a conexão ao pool. Se a liberação falhar, a conexão é destruída.

`noOverlap` e o controle de tarefas ativas também evitam repetição dentro do processo. Ao receber Ctrl+C/SIGTERM, o backend impede novos disparos, pede ao expurgo que pare entre horas e à limpeza que pare entre lotes, e aguarda o trabalho atual antes de fechar o pool. O prazo de desligamento é 30 segundos; uma interrupção forçada deixa o InnoDB desfazer a transação incompleta.

Esses locks coordenam as rotinas. Eles não transformam o hub SSE em um barramento entre servidores nem implementam assinatura MQTT compartilhada. A implantação permanece de uma instância; distribuição do serviço será tratada na etapa de implantação se necessária.

### 14.4 Por que o expurgo precisa de uma transação por hora

O resumo guarda contagem, média, mínimo e máximo de temperatura e umidade. Apenas conferir se existe uma linha de resumo seria insuficiente: uma leitura atrasada poderia ter chegado depois dela. O procedimento implementado é:

1. Selecionar a próxima hora de um ambiente anterior ao limite.
2. Bloquear a empresa e a faixa de leituras, na mesma ordem utilizada pela ingestão.
3. Recalcular e gravar o resumo com `INSERT ... ON DUPLICATE KEY UPDATE`.
4. Excluir as leituras dessa hora com comandos de no máximo 10.000 registros.
5. Conferir se a quantidade removida coincide com o resumo e confirmar tudo junto.

Se qualquer lote falhar, **todos os lotes daquela hora e o resumo são revertidos**. Isso evita resumir apenas o restante de uma hora parcialmente apagada na próxima tentativa. Horas já concluídas permanecem confirmadas. Reexecutar não duplica resumos nem remove o resumo histórico.

O corte é arredondado para o começo da hora em UTC, preservando até uma hora adicional de dados brutos. Nunca são apagadas leituras mais novas que 90 dias. Leituras muito antigas não podem ser reinseridas pelo fluxo MQTT normal: a idade máxima configurável é 90 dias. Importações SQL manuais de dados já expurgados exigiriam um procedimento próprio de reconciliação, fora desta fase.

`qtd_leituras` é SMALLINT UNSIGNED no schema confirmado: comporta até 65.535 leituras por ambiente/hora. A rotina falha preservando os dados quando esse limite é excedido; não trunca contagens para permitir a exclusão. A transação é limitada a uma hora, com lotes de até 10.000; não envolve os 90 dias inteiros.

A FK de `alerta.leitura_id` usa `ON DELETE SET NULL`. Assim, o alerta preserva valor inicial, extremo, limite, severidade, reconhecimento e encerramento depois do expurgo. O job não encerra alertas e não reavalia limites.

### 14.5 Série histórica e presença do dispositivo

A série passa a informar `fonte: "leituras_brutas_e_resumos"`. Para cada hora, consulta leituras brutas se ainda existem; usa o resumo somente quando toda aquela hora foi expurgada. A consulta SQL faz essa escolha em uma mesma visão consistente e não soma as duas fontes. O limite de duração continua em 366 dias; histórico e CSV continuam com intervalos de até 31 dias e passam a depender da disponibilidade das leituras brutas após a retenção.

Regra conservadora proposta ao proprietário e adotada nesta implementação: se o início for anterior ao corte de retenção, início e fim devem coincidir com horas completas UTC. Caso contrário, a API retorna 400/HORAS_COMPLETAS_OBRIGATORIAS, sem arredondar silenciosamente. Consultas recentes continuam aceitando minutos e segundos. Não é matematicamente possível recuperar a média de 10:30–11:00 a partir apenas do resumo de 10:00–11:00. A regra pode ser revista conforme a preferência do proprietário.

O job de offline revalida o prazo no UPDATE, depois de obter a trava da empresa. Se uma mensagem renovar o contato antes disso, o dispositivo permanece online. Não modifica a última leitura, o contato, o indicador de manutenção ou os episódios. Depois do commit, emite invalidação SSE somente à empresa afetada. A próxima mensagem válida retoma o fluxo de presença implementado na Fase 4.

### 14.6 Como testar e o que falta

```powershell
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend test
$env:NODE_ENV='test'
$env:DB_TARGET='local'
npm --prefix backend run test:integration
npm --prefix backend run test:mqtt
Remove-Item Env:NODE_ENV
Remove-Item Env:DB_TARGET
npm --prefix backend run build
```

Os testes novos usam empresas próprias e datas sintéticas do ano 2000; seus cortes de exclusão não alcançam leituras e sessões reais da bancada. Cobrem idempotência, limites UTC, atualização atrasada, ausência de duplicidade na série, concorrência por GET_LOCK, prazo individual de offline, corrida com novo contato, rollback sem SSE, preservação de alerta, falha no segundo lote de um expurgo de 10.001 leituras, capacidade do schema, retenção de sessões e desligamento do agendador. A suíte recusa Aiven.

Validação conjunta no CI e ativação local concluídas; evidências finais na seção 14.8. A regra conservadora de horas completas está documentada; não houve resposta à preferência consultada durante a implementação. Próxima fase, após concluir e aceitar esta entrega: **Fase 7 — implantação e demonstração**. Frontend permanece posterior à conclusão do backend. O segundo repositório depende de URL e acesso.

Referências técnicas consultadas: [node-cron — API](https://www.nodecron.com/api-reference.html) e [MySQL — locks nomeados](https://dev.mysql.com/doc/refman/8.0/en/locking-functions.html).


### 14.7 Validação intermediária e ajuste de paginação

Os 48 testes sem banco passaram, assim como os 9 testes MQTT executados com acesso aos brokers locais. Os oito testes novos de manutenção MySQL passaram dentro da suíte. Tentativas conjuntas também encontraram timeouts em testes antigos, reset HTTP e estouro do prazo de 3 segundos no teste de carga; essas tentativas não constituem aceite.

A paginação passou a selecionar primeiro os IDs no índice e depois carregar os campos das 500 leituras da página. O teste de carga usa o cliente HTTP nativo do Node, timeout de 3 segundos e leitura completa do corpo, preservando a exigência original; CSV continua conferindo 100.001 linhas. A execução isolada passou, mas a repetição conjunta ainda teve instabilidade local. O CI em banco isolado foi aprovado, conforme seção 14.8. Nenhum limite foi relaxado e nenhum contêiner de outros projetos foi parado.

### 14.8 Encerramento — 14/10/2026

Fase 6 concluída. Commit de implementação: `e1b3468`. CI completo aprovado: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38451967878. Foram aprovados lint, TypeScript, build e **107 testes: 48 sem banco, 50 de integração MySQL e 9 MQTT**. A suíte inclui a exigência de desempenho das páginas inicial/final de 100.000 leituras e a conferência integral do CSV. As instabilidades locais anteriores permanecem registradas na seção 14.7; não foram omitidas nem contadas como sucesso.

O backend foi compilado e iniciado na porta 3000 com `DB_TARGET=local`, `JOBS_ENABLED=true` e HiveMQ local. O resumo de inicialização concluiu em 878 ms, com seis linhas afetadas; o agendamento de offline também executou com sucesso, sem dispositivos a alterar. Conferência no MySQL: seis resumos por hora representando as 6.014 leituras existentes do ambiente 25; os dados brutos foram preservados. A última leitura observada é de 13/10/2026 às 19:07:32.823 UTC; esta checagem não representa uma nova validação física do ESP32.

Verificação autenticada da versão ativada: login 200, painel 200 com um ambiente, alertas 200, histórico 200 com 1.452 leituras no intervalo consultado de 24 horas, série 200 com duas horas, CSV 200 com 1.453 linhas, SSE 200 com aviso inicial e logout 204. O intervalo consultado é móvel; seus totais diferem do total acumulado do banco.

Expurgo e limpeza de sessões estão habilitados nos horários documentados. A execução destrutiva foi exercitada em fixtures próprias no CI/MySQL, sem antecipar a agenda diária sobre dados reais para produzir evidência. Nenhum schema, credencial ou dado do Aiven foi alterado nesta fase. `.env`, certificados, credenciais de laboratório e scripts privados de checagem não entram no Git.

Tag de conclusão: `backend-fase-6`. Próxima etapa, após aceite: **Fase 7 — implantação e demonstração**. Antes de implementá-la, revisar seu plano e obter os dados de hospedagem/broker necessários. Frontend ainda não iniciado. A publicação no segundo repositório de wxlv7h continua dependendo da URL do repositório e do acesso de colaborador.

## 15. Fase 7 — implantação e demonstração (em andamento)

### 15.1 Responsabilidade de cada serviço

Aiven armazena os dados MySQL. O broker recebe e distribui mensagens MQTT. O programa Node/Express executa a ingestão, as regras, as APIs, o SSE e as rotinas; portanto precisa de um servidor próprio em funcionamento. Vercel hospedará o frontend em etapa posterior. Railway era uma opção do plano, não uma dependência do código. O proprietário solicitou hospedagem estritamente gratuita; nenhum serviço pago foi contratado.

O HiveMQ Lab atual está no Docker do computador: backend usa `127.0.0.1:1883`; ESP32 usa o IPv4 Wi-Fi do computador (observado nesta etapa: `192.168.0.100:1883`, sujeito a mudança por DHCP). Não se trata de endpoint Cloud. Em 14/10, o proprietário autorizou criar EMQX Serverless com Spend Limit = 0. A criação está a cargo do proprietário; conexão remota ainda não validada. Alterar `MQTT_URL`, usuário, senha e CA troca o fornecedor sem alterar regras de negócio.

### 15.2 Separação de contas no MySQL

`src/config/database-roles.ts` exige identidades distintas. `main.ts` abre pools separados: API, manutenção e demonstração. Quando jobs ou demo estão habilitados, a respectiva credencial é obrigatória; não há fallback para a conta da API.

No `.env`, a API usa `DB_LOCAL_USER/PASSWORD`; as outras contas usam `DB_LOCAL_MAINTENANCE_USER/PASSWORD` e `DB_LOCAL_DEMO_USER/PASSWORD`. Para Aiven, substitua o prefixo por `DB_AIVEN_`. Host, porta, banco e validação de certificado são compartilhados pelo destino selecionado em `DB_TARGET`. A CA do Aiven pode vir de arquivo ou de `DB_AIVEN_CA_PEM` em um gerenciador privado de variáveis.

As permissões estão em `src/db/runtime-grants.ts`. A API não apaga leituras nem altera schema. Manutenção pode resumir, marcar offline e expurgar leituras/sessões. Demo apenas consulta a projeção necessária. Alguns locks `SELECT ... FOR UPDATE` exigiram `UPDATE(id)` em tabelas específicas; esse privilégio de coluna foi incluído e testado, sem conceder atualização geral à manutenção.

O provisionamento usa credenciais administrativas somente em `.env.provision`, com `DB_PROVISION_TARGET`, `DB_PROVISION_USER` e `DB_PROVISION_PASSWORD`. Após preencher credenciais privadas de runtime no `.env`, execute no diretório backend:

```powershell
npm run db:provision:runtime -- api
npm run db:provision:runtime -- maintenance
npm run db:provision:runtime -- demo
```

O comando recusa sobrescrever usuários existentes. DDL de contas não é transacional: em falha parcial, conferir o usuário antes de repetir. As três contas locais foram criadas nesta etapa; Aiven ainda não recebeu essas alterações. `.env.test`, ignorado pelo Git, preserva a conta local apropriada para criar/remover fixtures; só é carregado com `NODE_ENV=test`.

### 15.3 Demonstração pública sem expor a bancada real

`GET /api/v1/demo/painel` é habilitado por `DEMO_ENABLED=true`, usa conta de leitura e consulta somente empresas `eh_demo=1`. Retorna nomes da hierarquia e estado/valores; não retorna usuários, credenciais ou identificador físico. Rejeita filtros e não oferece escrita. Usa `no-store` e limite de 60 requisições por minuto/IP.

O seed executável é `backend/seeds/stma_seed_demo.sql`, chamado por `npm run db:seed:demo -- --target=local`. Cria uma empresa explicitamente fictícia, dispositivo `stma-demo-simulado-001` offline e leitura simulada. Foi aplicado localmente e repetido sem duplicação. O arquivo de referência preexistente em `docs/03-implementacao/stma_seed_demo.sql` foi preservado; não executar ambos. A bancada física não foi convertida em empresa pública.

### 15.4 Firmware e regras de negócio

A cópia `firmware/mqtt_esp32_stma_tls` prepara TLS com CA, relógio UTC por NTP, publicação QoS 1 e leituras a cada 30 segundos. Seu README explica configuração e limitações. A configuração real e a gravação na COM13 dependem do endpoint/credenciais/CA do broker. Compilação isolada não comprova conexão física. O firmware anterior foi preservado.

As regras estão consolidadas em [regras-de-negocio.md](regras-de-negocio.md). No código, ficam distribuídas entre serviços de aplicação, funções de domínio, repositórios transacionais e restrições/view MySQL; o documento identifica esses pontos. Não se concentrou toda a lógica em um único arquivo de código.

### 15.5 Evidências e pendências

Verificações intermediárias: 51 testes sem banco aprovados; teste da projeção pública aprovado; três testes de permissões com MySQL real aprovados. Uma execução conjunta da integração apresentou timeout no teste preexistente de paginação de 100 mil leituras; o limite de três segundos não foi relaxado. O aceite da regressão/CI da Fase 7 permanece pendente.

Preparados Dockerfile com usuário não privilegiado e contexto de build que exclui arquivos privados. Ainda falta validar imagem, ativar a versão completa, testar TLS físico, provisionar contas restritas no Aiven, hospedar o Node e medir latência. Nenhum deploy remoto ou conclusão da fase é declarado por estes preparativos. Frontend permanece posterior ao backend.

Atualização da verificação local: lint, typecheck, os 51 testes sem banco e build aprovados. O firmware novo compilou para `esp32:esp32:esp32`, com ArduinoMqttClient 0.1.8: 1.025.097 bytes de programa (78%) e 49.484 bytes de RAM (15%). A compilação usou configurações de exemplo; não houve gravação na placa nem conexão TLS nesta verificação.

## 16. Complemento autorizado — MVP público com persistência no Aiven (19/10/2026)

### 16.1 Análise e escolha

A página de teste usa MQTT.js/WSS diretamente no navegador, com tópicos globais
e comandos de LED/limite. O firmware original não entregava JSON completo com
identificador/tempo e porta por dispositivo para o contrato do banco. Mantivemos
os originais e criamos `firmware/mqtt_esp32_limite_stma_v2`. O guia
[mvp-bancada-aiven.md](mvp-bancada-aiven.md) reúne comandos e configuração.

Adotado: ESP32 → HiveMQ público → Node local → Aiven → REST/SSE → React. O broker
é o mesmo da página; o caminho de persistência mantém a arquitetura e o isolamento
por empresa. O frontend não passa a falar MQTT diretamente. Produção fica para
pós-MVP; a pendência de hospedagem do backend não foi resolvida.

### 16.2 Contrato e banco

`/dados` fornece JSON validado com id, temperatura, umidade e timestamp UTC quando
NTP disponível. `/porta` gera evento apenas quando muda; `/status` trata presença;
`/controle` atualiza estado confirmado de LED, limite e UUID. Tópicos globais de
compatibilidade não geram leituras duplicadas no banco.

A migração `002_device_control.sql` adiciona quatro colunas a `dispositivo` sem
apagar dados nem alterar o número de tabelas. Foi aplicada nos dois bancos. Um
banco novo recebe 001+002; banco existente usa `migrate:control`, com privilégios
de migração. A adoção de Prisma futura segue viável pelos contratos de repositório.

Com autorização explícita, criados no Aiven Laboratório STMA, Bancada, Testes,
Bancada ESP32, dispositivo e três perfis operacionais. A conta de manutenção é
separada e limitada às rotinas; os segredos estão no perfil privado `.env.mvp`.
Não redefinimos o superadmin remoto. A API Aiven ainda usa a credencial existente;
sua restrição final integra as pendências de produção.

### 16.3 Código e configuração

`STMA_ENV_FILE` permite sobrepor `.env` com `.env.mvp`; o launcher `dev:mvp` prepara
o perfil e as CAs do sistema. `mqtt.ts` aceita WSS e allowlist. O broker pode ser
trocado por configuração mantendo tópico/payload; não há SDK exclusivo HiveMQ nas
regras. `control.service.ts` contém as regras do comando; `control.routes.ts` faz
HTTP/perfis/CSRF; `mysql-control.repository.ts` consulta/audita; `mqtt-consumer.ts`
publica. Transações e SSE pós-commit permanecem no repositório de telemetria.

O comando traz UUID e expira em 15 s. API devolve 202 após PUBACK, sem afirmar
execução física. Firmware devolve UUID; frontend só confirma após lê-lo no banco.
Leitor não escreve; administrador/operador exigem empresa correta, estado recente,
dispositivo ativo, online e fora de manutenção. Controle manual exige automático
desligado. Solicitação fica auditada mesmo se a entrega não for confirmada.

### 16.4 Validação e ajustes de bancada

Corrigido MAC zerado: `WiFi.macAddress()` antes da conexão retornava zeros no core
instalado; `esp_read_mac` lê o MAC de hardware. Compilação ESP32 core 3.3.12:
941.933 bytes de programa (71%) e 48.516 bytes de RAM (14%). Gravação na COM13
verificada por hash; leitura serial confirmou `esp32-a8032a1e7214` e horário UTC.

Primeira consulta física ao Aiven confirmou nove leituras, um evento de porta,
LED e estado online. A ingestão a cada 5 s acumulou mensagens devido às consultas
transacionais remotas; intervalo configurável ajustado para 15 s. Isso não altera
as regras de alertas. O sensor continua sem buffer offline e publica QoS 0.

Encontrada e corrigida interferência das novas rotas no login: middleware agora
alcança somente `/dispositivos/:id/controle`. Teste de integração verifica que o
login e `/auth/me` continuam acessíveis conforme seus próprios contratos.

Lint, build e 56 testes sem banco aprovados na árvore local (inclui preparativos
de demo preexistentes). Uma execução conjunta da integração teve 55 aprovações e
timeout no benchmark de 100 mil leituras. Reexecução isolada aprovou os seis testes
de monitoramento: páginas em 129/119 ms e CSV completo com 100.001 linhas. Limite
de 3 s preservado; não contabilizar a tentativa conjunta como aprovação completa.

### 16.5 Pendências e próximos passos

Concluir evidência de comandos físicos, regressão e versionamento desta adaptação.
Depois, seguir Fase 6 do frontend mediante aceite; Fase 7 do backend permanece
aberta para hospedagem, broker privado/TLS/ACL e validação remota. Os preparativos
anteriores da seção 15 e os perfis existentes foram preservados.

### 16.6 Fechamento funcional da bancada

Login Aiven e painel reais aprovados; comando manual e automático em 28 °C
confirmados pelo ESP32, com restauração do estado anterior. Nova consulta:
86 leituras, um evento de porta, placa online, LED apagado e limite nulo.
Cadastro sincronizado para intervalo de 15 segundos, com auditoria. O timeout
PUBACK passou a 10 s para acomodar a latência das transações da conexão consumidora.

A regressão conjunta agora aprovou 56 testes de integração, incluindo o benchmark
inalterado de 100 mil leituras. Os 56 testes sem banco e nove MQTT anteriores
passaram; um décimo teste MQTT foi acrescentado para comando não retido e UUID
confirmado persistido. O código de suporte de pools separados/demo previamente
preparado foi preservado, com demo desabilitada no perfil MVP. Publicar esses
preparativos não significa declarar implantação de produção concluída.

O original do usuário foi preservado. Código novo em
`firmware/mqtt_esp32_limite_stma_v2`; pacote local para download em
`firmware/mqtt_esp32_limite_stma_v2.zip`, contendo somente `.ino`, exemplo de
configuração e README. O `config.h` privado nunca entra nesse pacote nem no Git.

### 16.7 Aceite técnico e publicação

Implementação publicada no commit `d30cba1`. CI backend aprovado:
https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39355577458.
Foram 122 testes (56 unitários, 56 MySQL e 10 MQTT), além de lint, typecheck,
migrações e build. No CI, páginas inicial/final de 100 mil leituras em 30/35 ms,
com CSV completo. Uma repetição local posterior voltou a exceder 3 s; portanto a
instabilidade local permanece registrada, sem alterar a exigência nem tratar essa
tentativa como sucesso. O CI em banco isolado aprovou a versão publicada.

Ajuste final de autorização: expressão MySQL de hierarquia ativa pode retornar
texto "0"/"1" no Aiven. O serviço converte explicitamente para número; teste recusa
"0", evitando confundir texto não vazio com dispositivo ativo.

MVP funcional concluído. Backend local ativo com `.env.mvp`; firmware v2 já gravado.
Fase 7 continua aberta para hospedagem, credenciais restritas da API, broker privado,
TLS físico e aceite remoto. Próxima etapa do frontend: Fase 6 mediante aceite.
Não houve contratação de serviço pago. A publicação no repositório de wxlv7h
continua dependendo da URL específica e do acesso de colaborador.

## Acompanhamento da Fase 6 do frontend — 20/10/2026

Frontend público de demonstração passou a consumir a projeção da API preparada na
Fase 7; sem login e sem escrita, com conta MySQL demo de leitura. Prova local com
build real e fixture removida ao terminar. A bancada Aiven e o broker público seguem
no fluxo autenticado existente; não receberam simulação estática nem novos cadastros.
O Node local estava sem responder durante a conferência e foi reiniciado com
`dev:mvp`; assinaturas MQTT e rotinas Aiven voltaram a executar. Ainda é necessário
manter esse processo ligado. A hospedagem contínua e o perfil MQTT/HTTPS de produção
continuam pós-MVP. A configuração Vercel do frontend depende da URL pública da API.

CI da entrega técnica de Fase 6 do frontend aprovado em 20/10/2026: frontend
39415983518 (29 unitários + 165 navegadores), backend 39415983669 (122 testes).
Validação real do frontend com login Aiven, cartão da placa e temas/logout também
passou, sem acionamento físico nesta fase. Implantação remota continua pendente.

### Estado da bancada — 21/10/2026

API/Vite reiniciados nos perfis existentes; assinatura HiveMQ e rotinas Aiven
confirmadas. A consulta ao banco encontrou o dispositivo offline, 1.991 leituras
acumuladas e última medição em 20/10 às 11:12:57 (Bahia). A COM13 não está presente
na enumeração atual. A retomada dos processos não equivale à comprovação de nova
telemetria: é necessário ligar/reconectar o ESP32. Nenhuma conta, seed ou perfil de
demonstração foi adicionado no Aiven nesta retomada. Perguntas específicas sobre
ativação demo e disponibilidade do aparelho Safari permanecem pendentes.
