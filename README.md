# STMA — Monitoramento remoto de temperatura e umidade

Portfólio de Desenvolvimento de Sistemas do SENAI, voltado a projetos elétricos
e automação industrial. Implementação gradual, com documentação didática.

**Fase 2 do backend STMA concluída; testes locais e CI aprovados.** Node.js 22,
Express, TypeScript estrito e MySQL sem ORM. A API oferece `GET /health` e
login, consulta de sessão e logout em `/api/v1/auth`. Cadastros, ingestão MQTT,
SSE e frontend pertencem às fases seguintes.

## Documentação vigente

- [Roteiro didático do backend](docs/roteiro-backend.md): configuração, comandos, arquitetura e evidências.
- [Plano do backend](<docs/03-implementacao/02-Plano de implementação do backend - STMA.md>): fases e critérios de aceite.
- [Schema definitivo confirmado](docs/03-implementacao/stma_schema.sql): 13 tabelas e uma view.
- [Diagrama de arquitetura](docs/03-implementacao/arquitetura-backend.png).
- [Colaboração no segundo repositório](docs/tutorial-colaborador-github.md).

O plano STMA de 12/10/2026 substitui o plano inicial. O backend recebe MQTT,
persiste no MySQL e transmite eventos autenticados via SSE ao navegador.
A troca de broker será configurável no adaptador de ingestão da Fase 4.
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
backend novo nem seed de usuários nesta fase.

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
São 18 testes sem banco e 8 com MySQL real. Não há conta pública de acesso;
os testes criam e removem os usuários necessários. O cadastro de usuários
e o provisionamento do primeiro administrador serão tratados na Fase 3.

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

## Histórico e continuidade

O setup inicial (`compose.yaml`, scripts da raiz e `docs/fase-0.md`) permanece
como histórico, com o banco `monitoramento_iot`. Para STMA use `compose.stma.yaml`,
`backend/.env` e os comandos acima; não misture os schemas ou seeds.

Repositório: [jorgeluizdossantos/monitoramento-iot-temperatura-umidade](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade).
A publicação em wxlv7h ainda depende da URL e do acesso de colaborador confirmados.
Próxima etapa, após aceite: **Fase 3 — cadastros e auditoria**.
Frontend somente após terminar o backend, conforme orientação do proprietário.
Licença [MIT](LICENSE).
