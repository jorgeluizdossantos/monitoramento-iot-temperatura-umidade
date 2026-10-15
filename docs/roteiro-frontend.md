# Roteiro do frontend STMA

## 1. Mudança de sequência autorizada — 14/10/2026

O proprietário autorizou iniciar o frontend com a Fase 7 do backend ainda aberta.
Esta autorização substitui a exigência anterior de terminar todo o backend antes das telas.
Não significa aprovação da implantação pública nem conclusão da Fase 7.

Permanecem pendentes no backend: regressão completa e CI da fase, publicação das alterações,
hospedagem Node, TLS remoto com EMQX, firmware físico, contas restritas no Aiven e medição
de latência ponta a ponta. O frontend usa API/MySQL locais durante o desenvolvimento.

## 2. Fontes e limites da primeira fase

Plano vigente: `03-implementacao/03-Plano de implementação do frontend Monitoramento IoT (STMA)-v01.md`.
Referência visual principal, confirmada pelo proprietário: `02-projeto/02-prototipo-stitch/web`.
O `telemetry_slate/DESIGN.md` complementa os tokens. Os protótipos orientam aparência,
mas o plano vigente e a API determinam telas e comportamento. Não copiar recursos fictícios
do desenho, como indicadores de broker sem endpoint, auditoria visual fora da fase ou usuário simulado.
Foram usados os tokens estruturados do DESIGN (também presentes no HTML do painel), Inter,
JetBrains Mono, azul técnico, superfícies claras, navegação lateral desktop e menu recolhível mobile.
As fontes são empacotadas localmente, sem dependência de CDN em execução.

A Fase 1 entrega somente esqueleto, navegação, cliente HTTP e CI. Todas as telas indicam
preparação; não apresentam métricas fictícias, sessão falsa nem botões que simulam operações.
Login, guards e menus por perfil pertencem à Fase 2. Telas com dados começam nas fases posteriores.

## 3. Estrutura criada e finalidade

- `src/app`: composição React, menu, rotas e carregamento da seção sob demanda.
- `src/shared/api/client.ts`: fetch na origem atual, cookie de sessão e contrato Zod.
- `src/styles.css`: tokens, hierarquia visual e regras responsivas.
- `tests/client.test.ts`: erros de API, resposta inválida, cookie e HTTP 204.
- `tests/e2e`: navegação, teclado, links diretos e larguras 360/768/1440.
- `.github/workflows/frontend.yml`: instalação reproduzível, testes, build e Chromium.

O TanStack Query já tem provider; ainda não existem consultas funcionais às telas.
Zustand e React Hook Form serão introduzidos quando sessão/formulários precisarem deles.
Não são criados estados globais vazios apenas para ocupar a estrutura.

## 4. API e autenticação por mesma origem

O backend utiliza `/api/v1`. Login: `POST /auth/login`, corpo `{email,senha}`;
resposta `{usuario}` e cookie HttpOnly. Sessão: `GET /auth/me`; logout:
`POST /auth/logout`, JSON vazio, retorno 204. Erros: `{erro:{codigo,mensagem,campos}}`.
O cliente preserva status e campos para as telas futuras, inclusive 401/403/404.
Redirecionamento ao login será responsabilidade da Fase 2; não foi antecipado.

Vite encaminha `/api` e `/health` ao backend. O navegador acessa somente sua própria origem,
sem armazenar token em localStorage e sem credenciais de broker/banco.
`PUBLIC_ORIGIN` deve coincidir com `http://127.0.0.1:5173`; proxy não apaga nem falsifica Origin.
`SESSION_COOKIE_SECURE=false` é exclusivo do desenvolvimento HTTP. Produção exige HTTPS.

O painel/stream reais estão em `/api/v1/painel` e `/api/v1/stream`. As fases posteriores devem
seguir o contrato efetivo: eventos SSE são avisos para reconsulta após commit, não leituras completas.
Pendências e adoção são exclusivas do superadmin (decisão posterior ao texto original do plano).
Histórico/CSV: 31 dias; série: 366 dias e horas completas UTC para períodos anteriores à retenção.

## 5. Como executar

No diretório frontend: `npm ci`, depois `npm run dev`. Abra http://127.0.0.1:5173.
Para mudar o destino local, copie `.env.example` para `.env.local` e ajuste `API_PROXY_TARGET`.
No backend, variáveis temporárias do terminal permitem testar sem reescrever `.env`:

```powershell
$env:PUBLIC_ORIGIN='http://127.0.0.1:5173'
$env:SESSION_COOKIE_SECURE='false'
$env:MQTT_ENABLED='false'
$env:JOBS_ENABLED='false'
npm start
```

Esse modo confere HTTP e MySQL; não prova ingestão nem executa rotinas. Para monitoramento real,
inicie outra sessão com a configuração de operação aprovada, após encerrar a instância de teste.

## 6. Verificação e continuidade

Executar `npm test`, `npm run build` e `npm run test:e2e` após instalar Chromium pelo Playwright.
Registrar resultados observados antes de declarar aceite. Fase 1 exige também CI aprovado.
Próxima fase, mediante aceite: login real, recuperação de sessão, guards e menus por perfil.
Recuperação de senha exibida em protótipos não tem API correspondente e não será simulada.

### Evidência inicial do backend local

Build TypeScript aprovado. Instância de validação iniciada na porta 3000 com MySQL local,
MQTT e jobs desligados por variáveis temporárias. Verificação autenticada: login 200,
painel 200 (um ambiente), alertas 200, histórico 200, série 200, CSV 200 e SSE 200
com aviso inicial; logout 204. O intervalo móvel de 24 horas retornou zero leituras e
CSV somente com cabeçalho: isto não é evidência de nova leitura física.

### Validação do frontend — 15/10/2026

Dependências instaladas e lockfile gerado. Foi necessário usar `NODE_USE_SYSTEM_CA=1`
no terminal npm devido à cadeia de certificados da rede; TLS permaneceu validado.
Timeouts de download foram resolvidos reutilizando o cache, sem trocar de registro.

`npm test`: quatro testes aprovados. `npm run build`: TypeScript estrito e Vite aprovados.
`PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` (no PowerShell, definir a variável antes do comando):
quatro testes aprovados em 19,8 segundos. Verificados 360, 768 e 1440 px, links diretos,
menu móvel, rota inexistente e link de pular conteúdo. Imagens desktop/mobile revisadas.
A primeira execução passou nas asserções, mas ficou no encerramento de processos do Windows;
a execução com permissões de navegador concluiu com código zero. CI utiliza Chromium.

Escopo preservado: esqueleto de navegação, não painel concluído. As referências web do Stitch
orientam cores, fontes, menu e superfícies; os dados demonstrativos dos protótipos não foram copiados.

Integração real pelo navegador e proxy Vite: login 200, `/auth/me` 200, cookie
`stma_session` HttpOnly/SameSite=Lax, logout 204 e `/auth/me` após logout 401.
A tentativa inicial encontrou API encerrada (proxy 500/ECONNREFUSED); após reiniciar a
instância de validação, o fluxo completo passou. Nenhuma credencial foi registrada no relatório.
O código parcial da Fase 7 do backend permanece fora do commit desta etapa; sua documentação
descreve o estado local e as pendências, sem declarar publicação remota dessa fase.

## 7. Encerramento técnico da Fase 1 — 15/10/2026

Implementação publicada no commit `768c18b`. [CI do frontend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38765158159):
instalação por lockfile, quatro testes de cliente HTTP, TypeScript/build e quatro testes Chromium.
[CI do backend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38765158163)
para o código já publicado; isso não valida nem encerra o código local parcial da Fase 7.
Tag: `frontend-fase-1`. Esta entrega não faz deploy público.

Prévia local: http://127.0.0.1:5173. A instância HTTP usada na validação está com MQTT e jobs
desligados; não confundir com operação contínua de telemetria. Os arquivos `.env` foram preservados.

Próximo passo após aceite: Fase 2 — login real, restauração/expiração de sessão, guards,
destino após login e menu por perfil. As fases de cadastro/painel/histórico não foram antecipadas.

## 8. Fase 2 — login e perfis (15/10/2026)

### Passo 1 — contrato e responsabilidade

O formulário envia `POST /api/v1/auth/login` com `email` e `senha`. O backend valida
credenciais e cria o cookie HttpOnly; JavaScript não lê esse cookie. `GET /auth/me`
retorna o usuário e seu perfil; `POST /auth/logout` revoga a sessão. Não há token ou
senha no localStorage. Zustand mantém somente os dados do usuário em memória.
As autorizações definitivas continuam no backend; esconder um menu não protege uma API.

### Passo 2 — formulário e apresentação

Instalados Zustand, React Hook Form e resolvers Zod. O arquivo
`frontend/src/features/auth/login.tsx` concentra o formulário, validação, envio,
erros acessíveis e controle de visibilidade da senha. O esquema de login exige senha
preenchida, sem reaplicar a política de criação a credenciais existentes. Cores,
tipografia, bordas e superfícies seguem a referência web do Stitch. Recuperação de
senha/OTP não foi implementada: não existe contrato correspondente no backend.

### Passo 3 — ciclo da sessão

`features/auth/auth.ts` concentra o estado e as operações da sessão. A aplicação
consulta `/auth/me` ao abrir, ao recuperar foco/visibilidade e a cada 60 segundos
quando visível. Respostas 401 também encerram a identidade local. Respostas antigas
são ignoradas após mudança de identidade; a consulta periódica aguarda o login.
Logout e troca de identidade limpam o cache TanStack Query, evitando exibir dados
da conta anterior. Falha de rede apresenta nova tentativa, sem anunciar logout
bem-sucedido. Falha no logout mantém o usuário e permite repetir a operação.

### Passo 4 — navegação e perfis

`session-boundary.tsx` verifica sessão e permissões antes de renderizar rotas.
Ao exigir login, preserva caminho, consulta e fragmento; após autenticar, retorna
somente a destinos internos permitidos pelo formato. Sem permissão, mostra acesso
negado, inclusive para URL digitada diretamente.

| Perfil | Navegação autorizada nesta etapa |
| --- | --- |
| Superadmin | Empresas e placas pendentes; sem painel de empresa implícito |
| Administrador | Painel, alertas, ambientes e cadastros da empresa |
| Operador/leitor | Painel, alertas e ambientes; sem menu de cadastros |

A matriz de exibição está em `allowedRoles`, em `features/auth/auth.ts`. Regras de
negócio definitivas permanecem documentadas em `docs/regras-de-negocio.md` e aplicadas
nos serviços/repositórios do backend. As páginas de dados ainda são preparações das
fases seguintes; autenticação concluída não significa painel ou cadastros concluídos.

### Passo 5 — validação e reprodução

Executar `npm test`, `npm run build` e `npm run test:e2e` na pasta frontend.
No Windows com Edge, definir `$env:PLAYWRIGHT_CHANNEL='msedge'` antes do último comando.
Os testes de navegador usam respostas controladas para cobrir os quatro perfis,
expiração, falhas, destinos e responsividade. Não dependem de credenciais reais no CI.

Verificação adicional executada contra API e MySQL locais: formulário real de login,
retorno a `/alertas`, restauração após recarga, cookie HttpOnly, logout e `/auth/me`
retornando 401. Credenciais lidas somente do arquivo privado já existente; nenhuma
credencial foi incluída nos testes versionados. Capturas em 360/1440 px revisadas.

### Pendências e próximo passo

Aguardar aceite para Fase 3: listas/formulários dos cadastros, desativação e adoção de
placas. Painel em tempo real é Fase 4; histórico/alertas são Fase 5. Deploy permanece
na Fase 6 do frontend e depende das pendências da Fase 7 do backend. Não houve deploy
público nem mudança no banco, firmware ou broker nesta etapa.

### Encerramento técnico da Fase 2

Commit `df6f5fa`, tag `frontend-fase-2`. Doze testes unitários e build TypeScript/Vite
aprovados localmente. Treze testes Edge aprovados; após o ajuste de concorrência,
os doze testes unitários/build foram repetidos e o CI validou os treze fluxos Chromium.
[CI frontend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38768198616).
Plano e README atualizados. Fase 3 aguarda aceite; pendências de hospedagem do backend
continuam abertas. A versão está no repositório jorgeluizdossantos; a publicação no
repositório wxlv7h continua dependente de URL e acesso ao repositório de destino.
