# Roteiro didático do backend STMA

Início: 12/10/2026. Etapa entregue: **Fase 1 — Base do projeto**, concluída conforme o plano STMA.
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
desta versão. Autenticação com sessão/argon2 será implementada na Fase 2.

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
Fases 2–7 do backend e todas as fases do frontend permanecem não iniciadas.

Evidência CI: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38311559868
