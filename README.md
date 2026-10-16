# STMA — Monitoramento remoto de temperatura e umidade

Portfólio de Desenvolvimento de Sistemas do SENAI, voltado a projetos elétricos
e automação industrial. Implementação gradual, com documentação didática.

**Fases 1–6 concluídas; 107 testes e CI aprovados. ESP32 validado com HiveMQ Lab e MySQL local.** Node.js 22, Express, TypeScript
estrito e MySQL sem ORM. A API oferece autenticação e cadastros de empresas,
unidades, setores, ambientes, usuários e dispositivos, com auditoria.
Ingestão MQTT, adoção de dispositivos, histórico/CSV/série, episódios de alerta e SSE autenticado estão implementados. Fase 6 concluída: resumo horário, offline, expurgo e sessões. Frontend autorizado em paralelo às pendências da Fase 7; Fase 3 (cadastros e adoção) implementada.

## Documentação vigente

- [Roteiro didático do backend](docs/roteiro-backend.md): configuração, comandos, arquitetura e evidências.
- [Plano do backend](<docs/03-implementacao/02-Plano de implementação do backend - STMA.md>): fases e critérios de aceite.
- [Schema definitivo confirmado](docs/03-implementacao/stma_schema.sql): 13 tabelas e uma view.
- [Diagrama de arquitetura](docs/03-implementacao/arquitetura-backend.png).
- [Colaboração no segundo repositório](docs/tutorial-colaborador-github.md).

O plano STMA de 12/10/2026 substitui o plano inicial. O backend recebe MQTT,
persiste no MySQL e transmite eventos autenticados via SSE ao navegador.
A troca de broker é configurável por URL, credenciais e CA no adaptador de ingestão.
Regras de negócio usam interfaces de repositório para permitir Prisma futuramente.

## Executar a base do backend

Pré-requisitos: Node.js 22 e Docker Desktop (MySQL local) ou serviço MySQL Aiven.
Na raiz `01-sistema-monitoramento`, usando PowerShell:

```powershell
npm --prefix backend ci
# Somente se backend/.env ainda não existir:
Copy-Item backend/.env.example backend/.env
# Preencha as senhas e confira DB_TARGET=local antes de prosseguir.
docker compose --env-file backend/.env -f compose.stma.yaml up -d --wait
npm --prefix backend run migrate
npm --prefix backend run db:check
npm --prefix backend run dev
```

Em outro terminal: `Invoke-RestMethod http://localhost:3000/health`.
Para compilar e executar: `npm --prefix backend run build`, depois
`npm --prefix backend start`. Ctrl+C encerra a aplicação e suas conexões.

A migração inicial exige banco vazio; não apaga nem reaplica sobre tabelas
existentes. Se já instalada, execute somente `db:check` e inicie o servidor.
DDL não é transacional: consulte o roteiro em caso de aplicação parcial.

## Selecionar local ou Aiven

Edite **backend/.env**: preencha `DB_LOCAL_*` e `DB_AIVEN_*`, depois escolha
`DB_TARGET=local` ou `DB_TARGET=aiven`. Reinicie o backend. Variáveis do processo
têm precedência; remova overrides antigos do terminal ao trocar o arquivo.

Local: `127.0.0.1:13308`, banco `stma_db`, volume isolado do setup anterior.
Aiven: hostname e porta fornecidos pelo serviço, credenciais próprias e CA em
`DB_AIVEN_CA_FILE`. TLS e verificação de identidade são obrigatórios no Aiven.
Certificados e arquivos `.env` não são versionados. Não há senha pública do
backend novo nem seed de demonstração nesta fase.

## Verificação

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

O CI em `.github/workflows/backend.yml` executa esses checks com MySQL real.
Testes de integração recusam Aiven. A base usa rollback; autenticação cria
dados locais identificados por UUID e remove somente seus próprios registros.
Os testes criam e removem seus próprios usuários. A integração não deve ser
executada contra Aiven. O roteiro descreve resultados e evidências por fase.

## Autenticação — Fase 2

| Método e rota | Resultado |
|---|---|
| POST /api/v1/auth/login | Recebe `{ "email": "...", "senha": "..." }`; emite cookie e retorna usuário |
| GET /api/v1/auth/me | Retorna o usuário, perfil e empresa da sessão válida |
| POST /api/v1/auth/logout | Recebe JSON `{}`; revoga sessão, remove cookie e retorna 204 |

Cookie HttpOnly, Secure e SameSite=Lax; token aleatório com SHA-256 no banco,
senha Argon2id. Em HTTP local, configure `SESSION_COOKIE_SECURE=false` apenas
em desenvolvimento; produção exige `true` e `PUBLIC_ORIGIN` HTTPS. A sessão
expira em 8 horas, configurável. Consulte exemplos e decisões no roteiro.

## Cadastros — Fase 3

Todas as rotas abaixo usam `/api/v1`, sessão autenticada e JSON.

| Recurso | Leitura | Escrita |
|---|---|---|
| /empresas | superadmin | superadmin; criação inclui primeiro administrador |
| /unidades, /setores, /ambientes, /dispositivos | administrador, operador, leitor da empresa | administrador da empresa |
| /usuarios | administrador da empresa | administrador da empresa |
| /dispositivos/:id/manutencao | — | PATCH por administrador ou operador |

Cada cadastro tem GET de lista e `/:id`, POST e PATCH `/:id`. PATCH com
`ativo=false` desativa; DELETE `/:id` com JSON `{}` é um alias de desativação.
Não há remoção física. Listas aceitam `pagina`, `tamanho` (máximo 500) e
`incluir_inativos=true`. Dados e auditoria são gravados na mesma transação.

Para o primeiro acesso, preencha `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL` e
`BOOTSTRAP_PASSWORD` (12–128 caracteres) apenas em `backend/.env`. Confira
`DB_TARGET` e execute `npm --prefix backend run auth:bootstrap`. O comando
cria um superadmin uma única vez, sem sobrescrever contas. Retire a senha de
bootstrap do arquivo após o provisionamento. Faça login e crie uma empresa
com o primeiro administrador conforme os exemplos do roteiro. Não há
cadastro público nem senha padrão.

## Histórico e continuidade

**Sequência atual autorizada:** frontend com Fases 1 a 3 implementadas enquanto a Fase 7 do backend
permanece aberta. Execute `npm --prefix frontend run dev` após instalar suas dependências;
veja [roteiro do frontend](docs/roteiro-frontend.md) e [instruções locais](frontend/README.md).
Login, sessão e permissões estão funcionais. Cadastros e adoção também estão funcionais; painel ainda é tela de preparação.

Fase 1 do frontend concluída tecnicamente em 15/10/2026, tag `frontend-fase-1`.
[CI aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38765158159).
Próxima etapa após aceite: painel em tempo real (Fase 4).

**Situação atual (14/10/2026):** fases 1–6 concluídas; Fase 7 em andamento. Os registros de próximos passos abaixo descrevem entregas anteriores. Consulte o acompanhamento atualizado no plano e a seção 15 do [roteiro do backend](docs/roteiro-backend.md). As [regras de negócio](docs/regras-de-negocio.md) estão consolidadas com o mapa dos arquivos que as implementam. Deploy remoto, TLS físico e aceite final da Fase 7 continuam pendentes.

O setup inicial (`compose.yaml`, scripts da raiz e `docs/fase-0.md`) permanece
como histórico, com o banco `monitoramento_iot`. Para STMA use `compose.stma.yaml`,
`backend/.env` e os comandos acima; não misture os schemas ou seeds.

Repositório: [jorgeluizdossantos/monitoramento-iot-temperatura-umidade](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade).
A publicação em wxlv7h ainda depende da URL e do acesso de colaborador confirmados.
Próxima etapa, após aceite: **Fase 4 — ingestão MQTT**.
Orientação original superada pelo aceite de iniciar o frontend com a Fase 7 aberta.
Licença [MIT](LICENSE).

## Ingestão MQTT — Fase 4

Consulte [o roteiro HiveMQ](docs/roteiro-hivemq-fase4.md) e a seção 12 do roteiro do backend. MQTT permanece desabilitado por padrão; configure o arquivo backend/.env antes de habilitá-lo. O comando mqtt:check verifica conexão e assinatura; mqtt:publish permite uma publicação controlada. O teste ponta a ponta usa dois brokers locais de compose.mqtt.yaml e MySQL local.

Firmware gravado na COM13 e apontado ao HiveMQ local; dispositivo adotado e leituras físicas persistidas. Consulte o encerramento da Fase 4 no roteiro. Próximo passo, após aceite: Fase 6. Fases 6–7 e frontend não iniciados.

## Leituras, painel e alertas — Fase 5

GET /api/v1/painel e /alertas exigem sessão vinculada à empresa. Histórico e CSV em /ambientes/:id/leituras e /ambientes/:id/leituras.csv aceitam de/ate com fuso até 31 dias; /ambientes/:id/serie aceita até 366 dias e calcula por hora das leituras brutas. POST /alertas/:id/reconhecer exige operador ou administrador. GET /stream envia avisos para reconsulta somente à empresa autenticada, após commit da ingestão. Consulte a seção 13 do roteiro para exemplos e limites.

Os testes de integração executam um arquivo por vez para isolar a carga de 100 mil leituras. Não execute esses testes no Aiven. A Fase 6 (rotinas) depende do aceite da Fase 5; não há frontend nesta entrega.

Entrega da Fase 5: tag backend-fase-5; [CI aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38445259187).

## Rotinas agendadas — Fase 6

Confira o banco selecionado e configure JOBS_ENABLED=true em backend/.env; reinicie o backend. Resumos executam na inicialização e a cada hora, offline a cada minuto, expurgo às 03:00 e sessões às 03:30 (America/Bahia). Leituras brutas são retidas por pelo menos 90 dias; resumos e alertas são preservados. Séries anteriores à retenção exigem início e fim em horas completas UTC. Veja a seção 14 do roteiro para transações, locks, testes e operação.

CI da entrega: https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38451967878. Tag: backend-fase-6. Próxima fase, após aceite: implantação e demonstração; frontend ainda não iniciado.
