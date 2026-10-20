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

## 9. Fase 3 — cadastros e adoção (16/10/2026)

### Etapa 1 — conferir contratos antes de desenhar as telas

Foram consultados os validadores, serviços e rotas do backend e a tela web
`cadastros_e_comissionamento_iot` do Stitch. O visual utiliza as mesmas superfícies
claras, azul, abas e cartões de comissionamento. Controles sem API, como ignorar
placa e abrir auditoria, não foram apresentados como funcionalidades prontas.

A empresa da operação vem da sessão do administrador. Somente o superadmin cria
empresas e seu administrador inicial, consulta a fila global e adota placas.
Ele não ganha acesso aos painéis ou aos usuários das empresas.

### Etapa 2 — modelar os formulários e os dados enviados

A pasta `frontend/src/features/cadastros` reúne a implementação:

| Arquivo | Responsabilidade |
| --- | --- |
| `model.ts` | Entidades, campos, esquemas Zod, valores iniciais e conversão para JSON |
| `cadastros-page.tsx` | Abas, lista paginada, carregar detalhe, editar e alterar situação |
| `cadastro-form.tsx` | Formulário, validação, erros de campo e envio da mutação |
| `reference-select.tsx` | Seletores paginados dos vínculos e destinos de adoção |
| `pending-page.tsx` | Payload, contatos da placa, escolha do destino e adoção |
| `confirmation.tsx` | Confirmação modal, foco e bloqueio durante o envio |

Os formulários de cadastro usam campos controlados e validação Zod explícita;
o login mantém React Hook Form. A configuração comum evita repetir as regras de
serialização nos seis formulários. Entradas numéricas viram números, campos opcionais
vazios viram `null` e senha vazia na edição é omitida. Edição envia somente campos
alterados; reenvio desnecessário de e-mail revogaria sessões no backend.

Os limites são validados no conjunto final do ambiente, inclusive quando apenas o
mínimo muda. Cada campo aceita o intervalo e a precisão previstos no backend.
A empresa é criada com seu primeiro administrador em uma transação já existente.
Erro 400 com `campos` é mostrado junto ao campo correspondente; erros gerais e
conflitos preservam o formulário para correção. A API continua sendo a autoridade.

### Etapa 3 — listas e exclusão lógica

A lista solicita 20 registros por página. Há filtro para incluir inativos e botão
de atualização. Seletores carregam 50 opções por vez e oferecem mais páginas;
a edição também busca o vínculo atual, inclusive se ele estiver inativo.

`POST /:entidade` cria; `GET /:entidade/:id` abre o detalhe; `PATCH` edita.
`DELETE` é desativação lógica, não remoção física. Uma confirmação é exigida tanto
para desativar quanto para reativar. O servidor mantém proteção do último
administrador e das hierarquias. Após mutações, o cache de cadastros é invalidado.
Após alterar usuários, a sessão é reconsultada para refletir mudanças de perfil.

### Etapa 4 — adoção com destino identificado

A API existente aceitava `ambiente_id`, mas não oferecia ao superadmin a hierarquia
para selecionar. Foi acrescentado:

`GET /api/v1/dispositivos-pendentes/destinos?empresa_id=ID&pagina=1&tamanho=50`

Retorna `dados`, `total`, `pagina`, `tamanho`. Cada destino contém `id`, `nome`,
`empresa_nome`, `unidade_nome` e `setor_nome`. Apenas superadmin; somente hierarquia
inteiramente ativa. A consulta não retorna usuários ou telemetria. O SQL usa
parâmetros e paginação. Não houve migração do schema.

Na interface: selecionar placa → conferir payload e contatos → escolher empresa →
escolher unidade/setor/ambiente na opção hierárquica → informar sensor e nome opcional →
confirmar. A chamada existente `POST /dispositivos-pendentes/:id/adotar` mantém sua
transação e verifica novamente o destino. Adoção não transfere leituras antigas da
fila. Intervalo e timeout são ajustados pelo administrador em Dispositivos depois;
o contrato de adoção não aceita esses campos e o formulário não promete enviá-los.
Atualização da fila nesta fase é manual; SSE pertence à fase seguinte.

### Etapa 5 — evidências de validação

- 15 testes unitários do frontend aprovados: sessão, cliente HTTP e payloads/formulários.
- 23 testes Edge aprovados: criação/edição/desativação das seis entidades, cancelamento,
  erros de campo, adoção com conflito e nova tentativa, permissões e responsividade.
- Build TypeScript/Vite aprovado; lint, typecheck e build do backend aprovados.
- 15 testes de integração dos cadastros aprovados no MySQL local, incluindo o novo
  endpoint de destinos, restrição ao superadmin, empresa e hierarquia inativa.
- Capturas de tela em 360 e 1440 px revisadas. Tabela vira cartões no celular.
- Formulário real com API/MySQL local: criação, edição e desativação de uma unidade
  identificada como `Validação frontend F3 ...`. O registro ficou inativo para
  preservar a auditoria. Credenciais permaneceram em arquivo privado.

Para repetir: `npm test`, `npm run build`, `npm run test:e2e` no frontend.
No backend, `NODE_ENV=test` e `DB_TARGET=local`, executar
`npx vitest run tests/cadastros.integration.test.ts --maxWorkers=1`.
Nunca direcionar testes de integração ao Aiven. Os testes de navegador versionados
usam respostas controladas; a conferência adicional com API real foi executada
localmente, sem credenciais versionadas. ESP32/COM13 não foi necessário nesta fase.

### Próxima etapa e pendências

Após aceite, Fase 4: painel por ambiente, navegação hierárquica, SSE e reconexão.
Histórico/gráficos/alertas funcionais continuam para Fase 5. Hospedagem e demonstração
permanecem vinculadas à Fase 6 do frontend e às pendências da Fase 7 do backend.
Publicação no segundo repositório (wxlv7h) ainda depende de URL e acesso.

### Encerramento técnico da Fase 3

Implementação publicada no commit `b4b0162`; tag `frontend-fase-3`.
[CI frontend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38901359475):
instalação por lockfile, testes unitários, TypeScript/build e 23 fluxos Chromium.
[CI backend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/38901359464):
validação do código publicado, incluindo a nova consulta de destinos e os testes
existentes de ingestão/adoção. Isso não encerra nem publica o trabalho local parcial
da Fase 7. Prévia local em http://127.0.0.1:5173; instância HTTP de validação com
MQTT/jobs desligados por variáveis temporárias. Arquivos `.env` preservados.
Próximo passo após aceite: Fase 4 do frontend.

## 10. Fase 4 — painel em tempo real (em validação, 17/10/2026)

### Implementação

`frontend/src/features/painel/model.ts` valida o contrato de `/api/v1/painel`,
normaliza DECIMAL do MySQL e mantém valores ausentes como `null`. A classificação
por placa vem do backend. A interface agrupa placas por ambiente; o resumo considera
a maior severidade entre placas online, fora de manutenção e com leitura. Sem uma
placa nessas condições, exibe “Sem dados atuais”. Não inventa uma medição agregada.
Placas offline/manutenção exibem a data da última leitura, sem apresentar o valor
antigo como atual. Datas usam America/Bahia e números usam pt-BR.

`panel-page.tsx` apresenta cartões, filtros de unidade/setor/estado, totais do recorte,
carregamento, vazio, erro e detalhe atual do ambiente. Filtros ficam na URL e a troca
de unidade limpa o setor. O visual segue o painel web do Stitch. Gráficos, histórico,
porta e episódios de alerta não foram simulados; o que pertence à Fase 5 segue pendente.

`realtime.ts` administra um EventSource por tela de monitoramento. O SSE existente
transmite `event: atualizar` com aviso de reconsulta, não o ID do ambiente. Por isso
consultamos `/painel` novamente e utilizamos compartilhamento estrutural do TanStack
Query e cartões memoizados para reaproveitar os que não mudaram. Avisos são agrupados
por 150 ms; avisos durante uma consulta geram nova consulta ao terminar, sem fila
ilimitada. A consulta usa a empresa da sessão, nunca um ID enviado como filtro à API.

Falha SSE ativa consulta a cada 30 segundos. Reconexões transitórias são do navegador;
um stream encerrado (`CLOSED`) é recriado após três segundos. Ao recuperar a rede,
a conexão anterior é fechada antes de abrir outra. Sair do painel encerra EventSource,
timers e listeners. HTTP 401 continua encerrando a sessão. Uma identidade já conhecida
é preservada durante erro de rede/503 na revalidação, para manter a tela e seus avisos;
isso não concede autorização: cada operação continua sendo validada pela API.

### Validação e ocorrências

22 testes unitários e build aprovados em 17/10. O teste de encerramento foi ajustado
para aguardar a navegação completar (carregamento lazy mantém a tela anterior até lá).
A prova integrada encontrou encerramento do SSE ao cair a rede; foi acrescentada e
testada a recriação controlada. Uma segunda instância Vite concorrendo pelo cache
causou timeouts de inicialização. O roteiro executável passou a usar o build estático,
com API e frontend na mesma origem, sem disputar o servidor de desenvolvimento.

Roteiro executável: `scripts/verify-frontend-realtime.cjs`. Usa MySQL local, Mosquitto
local 18884, uma empresa/usuário/placa de teste com UUID e sessão temporária. Publica
via MQTT, verifica persistência, atualização no navegador e retorno após queda de rede.
O bloco `finally` remove somente as fixtures criadas por essa execução. Não usa senhas
de usuários nem ESP32 físico. Executar após os builds de backend e frontend, com Edge
instalado e banco/broker locais ativos. Resultados finais e CI serão registrados após
confirmação; esta seção ainda não declara a fase encerrada.

### Evidências finais locais — 17/10/2026

- Regressão completa: **31 testes Edge aprovados** (35,3 s), com dois workers.
- Compatibilidade antecipada: **8 testes WebKit aprovados** (45,7 s), incluindo
  360/768/1440 px, filtros, atualização e fallback. WebKit no Windows não substitui
  a revisão em iPhone físico prevista para o acabamento.
- Capturas Edge em 360 e 1440 px revisadas, sem transbordamento horizontal.
- Prova real local: **MQTT → MySQL → SSE → cartão em 332 ms**, duas leituras persistidas,
  retorno após queda de rede confirmado. Broker Mosquitto, publicador simulado e build
  distribuível da interface; não é medição de latência da hospedagem pública ou ESP32.
- O Docker estava fechado na retomada; MySQL e broker foram iniciados com os arquivos
  Compose existentes. Não houve troca de credenciais ou migração de schema.

Reprodução da prova integrada, a partir da raiz do projeto:

```powershell
docker compose --env-file backend/.env -f compose.stma.yaml up -d --wait
docker compose -f compose.mqtt.yaml up -d --wait broker
npm run build --prefix backend
npm run build --prefix frontend
node scripts/verify-frontend-realtime.cjs
```

O script reserva a porta 5174 temporariamente e encerra seu servidor ao terminar.
A conexão e as consultas do frontend permanecem na mesma origem; o script usa uma
sessão temporária da fixture para concentrar a prova na telemetria, pois o login
já é coberto pelos testes próprios. Nenhuma credencial é enviada ao broker no navegador.
Para WebKit: `npx playwright install webkit` e
`npx playwright test tests/e2e/painel.spec.ts --browser=webkit --workers=1` dentro de
frontend, sem a variável `PLAYWRIGHT_CHANNEL=msedge` nessa execução.

Próxima etapa após aceite: Fase 5 — histórico, gráficos e alertas. Hospedagem do
backend/Fase 7 e publicação no segundo repositório continuam pendentes conforme seus
registros. O fechamento remoto desta fase depende da confirmação do CI abaixo.

### Encerramento técnico da Fase 4 — 17/10/2026

Commit `b114315`, tag `frontend-fase-4`.
[CI frontend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39025838662):
22 testes unitários, build e 31 testes Chromium.
[CI backend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39025838676)
para o código publicado. Esta entrega não publica nem encerra as alterações locais
parciais da Fase 7 do backend. Validações locais adicionais: 31 Edge, 8 WebKit e
prova integrada de 332 ms com reconexão, conforme descrito acima.

Plano, roteiro e documento de regras de negócio atualizados. Fase 5 aguarda aceite:
histórico paginado, gráficos, série por hora, alertas e exportação CSV. Não houve
deploy público nesta etapa; pendências de hospedagem e segundo repositório permanecem.

## 11. Fase 5 — histórico, gráficos, CSV e alertas (17/10/2026)

### Objetivo e sequência de construção

A fase foi autorizada após as quatro anteriores. Restavam duas fases; esta entrega
implementa a quinta, mantendo a sexta para novo aceite. As referências visuais são
as telas de detalhes do ambiente e central de alertas do STITCH/web. O plano define
as funcionalidades: não foram copiados diagnósticos de broker, silenciamento,
assinaturas ou pareceres que aparecem apenas como ilustração no protótipo.

1. Conferimos os contratos existentes em `history.routes.ts`, `history.service.ts`,
   `mysql-history.repository.ts` e `monitoring.*`. O backend continua responsável
   por autenticação, escopo empresarial, limites e persistência.
2. Criamos `frontend/src/features/ambiente/model.ts`: Zod valida respostas;
   DECIMAL vira número finito; BIGINT permanece texto. Datas digitadas em Bahia
   são convertidas para UTC com offset explícito, independentemente do computador.
3. `history-page.tsx` consulta 20 leituras por página no servidor. A chave do cache
   inclui usuário, ambiente, período e página. Trocar o período volta à página 1.
   A tabela nunca busca todas as leituras para depois paginar no navegador.
4. `trend.tsx` utiliza Recharts, carregado sob demanda. A API fornece agregações por
   hora; períodos longos são agrupados em até 240 intervalos no gráfico. A média é
   ponderada pela quantidade de leituras, e os mínimos/máximos são preservados.
   Intervalos sem observações ficam vazios. A tabela expansível mostra a série
   original por hora, 20 pontos por página, como alternativa textual ao gráfico.
5. `period-form.tsx` permite até 31 dias para leituras/CSV e 366 para série. O início
   é inclusivo e o fim exclusivo. Antes de 90 dias, resumos exigem horas completas.
   As faixas destacadas são as configurações atuais, sem alegar limites históricos.
6. `downloadCsv` compartilha erros e tratamento de HTTP 401 com o cliente JSON.
   A transferência pode ser cancelada e é abortada ao sair da tela. O arquivo só
   é oferecido depois do corpo completo; resposta JSON ou fluxo interrompido não
   é tratado como CSV válido. O servidor transmite lotes; o navegador reúne o
   arquivo em Blob. Isso consome memória proporcional ao arquivo, mas não cria
   componentes/objetos por leitura. Cargas maiores que a validada devem ser
   medidas antes de ampliar limites ou escolher um download direto para disco.
7. `features/alertas/alerts-page.tsx` lista abertos/encerrados/todos, com paginação,
   severidade, valor inicial/extremo, limite, duração e reconhecimento. Atualiza
   a cada 30 s quando ativa. O operador/administrador confirma a ciência; leitor
   não recebe o botão. A autoridade final é o backend. Reconhecer não encerra.
8. O detalhe do ambiente incorpora gráfico e alertas próprios. Acrescentamos o
   parâmetro opcional `ambiente_id` a `GET /api/v1/alertas` e o nome do ambiente na
   listagem. A consulta SQL mantém `empresa_id` da sessão; não aceita empresa do
   cliente. O filtro ocorre antes da paginação, evitando omitir alertas por filtrar
   uma página global no navegador. Sem mudança de schema ou migração de banco.
9. Atualizamos as rotas e adaptamos testes de autenticação que antes encontravam
   páginas de preparação. Histórico/alertas usam tabelas/cartões responsivos.

### Como experimentar

Com backend local em execução e frontend iniciado com `npm run dev`, entre como
leitor, operador ou administrador de uma empresa. Abra Painel → Detalhes do ambiente
→ Histórico e exportação CSV. Escolha início/fim e clique Aplicar período. Confira
as unidades °C e %, expanda a tabela da série e navegue pelas páginas de leituras.
O modo Série por hora habilita períodos longos; CSV fica desabilitado acima de
31 dias. Na Central de alertas, troque a situação. Como operador, reconheça um
alerta e observe a data de reconhecimento, sem mudança automática para encerrado.

### Verificações reproduzíveis

```powershell
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix backend run build
# MySQL local ativo, sem necessidade de broker ou ESP32 nesta prova:
node scripts/verify-frontend-history.cjs
# No diretório frontend:
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run test:e2e -- --workers=2
# Opcional, WebKit instalado; não equivale a um iPhone físico:
$env:PLAYWRIGHT_CHANNEL=''
npx playwright test tests/e2e/history.spec.ts --browser=webkit --workers=1
```

O roteiro `scripts/verify-frontend-history.cjs` cria empresa, usuário, sessão,
hierarquia, dispositivo, alerta e 100 mil leituras com identificador de fixture.
Serve o build e a API na mesma origem, porta 5174, valida paginação, gráfico,
CSV completo e reconhecimento gravado. O `finally` remove apenas essas fixtures.
Não imprime credenciais e não modifica dados da empresa usada pelo aluno.

Resultados locais iniciais: 27 testes unitários frontend; build frontend/backend;
37 testes Edge; cinco testes de integração MySQL do módulo de monitoramento.
Prova real: 100.000 leituras, 20 linhas renderizadas, primeira página em **551 ms**,
CSV com **100.001 linhas** e reconhecimento persistido sem encerrar episódio.
A medição é local, não uma promessa de latência de hospedagem pública.
Capturas de histórico/alertas em 360 e 1440 px foram revisadas.

A instalação do Recharts revelou avisos em dependências anteriores. React Router
foi atualizado para 7.18.4 e Vitest para 5.0.5; `npm install` terminou com zero
vulnerabilidades reportadas. A regressão de login, cadastros e painel passou com
as versões novas. Não foi usado `npm audit fix --force`.

### Pendências e próxima fase

O resultado final do WebKit e da publicação/CI será registrado no fechamento desta
seção. A Fase 6 permanece sem início: demonstração pública, revisão final de
acessibilidade, navegadores completos, documentação de implantação e deploy.
A Fase 7 do backend continua parcial; hospedagem Node.js, configuração remota
segura e segundo repositório permanecem nas pendências já documentadas.

Validação complementar: **seis testes WebKit aprovados** (36,6 s), incluindo CSV,
perfis e responsividade. Após ajuste do intervalo inicial para as últimas 24 horas
até o minuto atual, os 27 testes unitários passaram novamente. Datas no eixo são
ancoradas na hora real da agregação, inclusive quando o período começa no meio da hora.

### Encerramento técnico da Fase 5 — 17/10/2026

Implementação publicada no commit `8c4bedf`, tag `frontend-fase-5`.
[CI frontend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39045798482):
instalação, 27 testes unitários, build e 37 testes Chromium.
[CI backend aprovado](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39045798469):
lint, tipos, testes, migração, integração MySQL, MQTT e build.
As alterações locais parciais da Fase 7 do backend não fazem parte dessa publicação.

Fase 5 concluída tecnicamente. Falta **uma fase do frontend**, a Fase 6, que aguarda
aceite: demonstração, acessibilidade, testes finais e implantação. O deploy completo
continua condicionado às pendências de hospedagem do backend. Plano, roteiros e
regras de negócio estão atualizados; não houve implantação pública nesta etapa.

### Suporte ao teste local — 18/10/2026

O login do superadmin falhava porque BOOTSTRAP_PASSWORD havia sido alterada no
.env, sem modificar o hash da conta existente. Após o proprietário ajustar a senha
para 12–128 caracteres, ela foi sincronizada exclusivamente no MySQL local com
Argon2id; sessões antigas foram revogadas e a operação registrada em auditoria,
sem senha ou hash no registro. Login e autenticação foram confirmados pelo serviço
de autenticação, e a sessão de teste foi revogada. O banco Aiven não foi alterado.

A mensagem “Muitas tentativas” corresponde ao limitador de login, cuja janela é de
15 minutos. A proteção permanece habilitada. No desenvolvimento, reiniciar o
backend limpa os contadores em memória; alternativamente, aguardar a janela
expirar. BOOTSTRAP_PASSWORD é entrada de provisionamento, não senha sincronizada
automaticamente com o banco. Esta correção não inicia a Fase 6.

### Contas para avaliação dos quatro perfis — 18/10/2026

A pedido do proprietário, foram disponibilizados os quatro níveis no MySQL local.
A senha vigente do superadmin foi preservada; a do administrador do Laboratório STMA
foi renovada e foram criadas contas de operador e leitor nessa empresa. As operações
foram auditadas e as sessões anteriores do administrador revogadas. Os quatro logins
foram validados pelo serviço de autenticação e as sessões de teste encerradas.
Credenciais entregues somente em `backend/.local/acessos-teste-local.txt`, ignorado
pelo Git. Não copiar senhas para documentação versionada. Não houve alteração no Aiven.
Para avaliar todos os cadastros e a telemetria, iniciar pelo administrador da empresa.
O superadmin permanece restrito ao escopo global de empresas e placas pendentes.

## Complemento do MVP — bancada física e Aiven (19/10/2026)

A solicitação atual autoriza adaptar as fases já implementadas à telemetria real,
sem declarar a Fase 6 ou a hospedagem do backend concluídas. Guia completo:
[mvp-bancada-aiven.md](mvp-bancada-aiven.md).

1. **Contrato do painel:** acrescentados `porta_aberta` e `porta_alterada_em` à
   validação Zod. Dados ausentes são tratados explicitamente; estado antigo não
   vira uma afirmação de porta atual. O backend consulta o último evento por placa.
2. **Detalhe do ambiente:** componente `features/ambiente/device-control.tsx`
   consulta estado por dispositivo a cada três segundos. Leitor vê estado;
   administrador/operador recebem ações. A aparência usa os componentes/classes
   do design existente, sem criar uma página paralela desconectada do sistema.
3. **Comandos:** botão manual e formulário de limite chamam a API autenticada.
   Resposta 202 mostra “aguardando confirmação”; somente o UUID retornado pelo
   firmware e persistido no Aiven produz “Comando confirmado pelo ESP32”. Após
   20 segundos sem confirmação, orientar a conferir estado. Não exibir sucesso
   apenas porque o botão foi clicado ou o broker aceitou a mensagem.
4. **Regras:** estado com mais de 30 s bloqueia ações; automático ativo bloqueia
   manual. Limite 0–50 °C, passo 0,1, separado das faixas ideais de alertas. A API
   repete todas as validações de autorização e de disponibilidade.
5. **Testes iniciais:** build e 27 testes unitários aprovados. Dez testes de painel
   no Edge aprovados, incluindo espera pelo UUID, bloqueio de manual com automático,
   leitor sem botões e operador impedido de atuar sobre estado antigo.
6. **Uso:** backend `npm run dev:mvp`, frontend `npm run dev`, endereço
   http://127.0.0.1:5173. Use as contas Aiven de laboratório do arquivo privado
   `backend/.local/acessos-mvp-aiven.txt`. Superadmin não opera telemetria da empresa.

Faltava neste registro intermediário concluir comandos físicos, regressão integral
e publicação. Evidências finais serão acrescentadas abaixo; a Fase 6 continua
pendente, assim como o backend hospedado de forma contínua.

### Evidência funcional do complemento

Login Aiven, painel, detalhe e comando manual foram validados pela interface real;
a API recebeu confirmação física do limite automático 28 °C e o estado anterior
foi restaurado. Capturas locais revisadas, preservando o layout do projeto.
O primeiro ponto isolado da série agora aparece nos gráficos (marcadores de raio
2); isso evita gráfico aparentemente vazio durante a primeira hora de telemetria.
Os 39 cenários Edge e 27 testes unitários passaram; teste específico desse ponto
foi acrescentado à suíte do painel. Publicação/CI registrados no fechamento abaixo.

### Publicação e testes finais

Commit `d30cba1`, CI frontend aprovado:
https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39355577471.
Build, 27 testes unitários e 40 testes Chromium aprovados, incluindo o ponto inicial
isolado do gráfico. Os 11 cenários atualizados do painel também passaram no Edge
local. CI backend aprovado com 122 testes. Planos atualizados com MVP concluído e
pendências preservadas. Próxima fase: **Fase 6 — acabamento, demonstração e implantação**,
ainda não iniciada por esta adaptação. Hospedagem contínua do backend segue pós-MVP.

## Fase 6 — execução autorizada em 20/10/2026

Status: implementação e validação técnica em andamento; implantação remota ainda
pendente da origem pública do backend e criação do projeto Vercel. Não marcar a
fase integralmente concluída enquanto esses critérios não forem comprovados.

### Escopo e decisões

O proprietário reafirmou que broker público continua entregando dados reais ao
Node local, que grava no Aiven. A Fase 6 mantém esse fluxo. Foi oferecida uma opção
de demonstração estática, mas ela não foi adotada; `/demo` usa somente a API pública
já planejada, com dados fictícios de empresa marcada `eh_demo=1` no MySQL. Ela não
substitui o painel da bancada e não exibe seu dispositivo real.

### Implementação didática

1. **Contrato de demo:** `features/demo/model.ts` valida `demonstracao=true`, campos
   públicos, valores e horários. A tela não recebe identificador de placa/usuário,
   não envia filtro de empresa e oferece somente consulta/atualização por GET.
2. **Acesso público:** `SessionBoundary` deixa `/demo` abrir sem consultar sessão.
   A indisponibilidade do login não impede conhecer a demonstração; a API demo
   pode apresentar sua própria indisponibilidade. As rotas operacionais mantêm os
   guards e autorizações do backend. Perfil leitor continua sem controles físicos.
3. **Apresentação:** estados usam texto/ícone, horários Bahia, ausência de dados
   explícita e leitura offline identificada como histórica. Não há sucesso fictício
   se a API falha. A página de endereço inexistente recebeu retorno ao início.
4. **Temas:** botão claro/escuro persiste apenas preferência no localStorage; sessão
   e token não são armazenados ali. Falha do armazenamento não impede o uso. Cores,
   foco visível e movimento reduzido foram revisados mantendo o visual do projeto.
5. **Tratamento de falha de renderização:** `RouteBoundary` oferece recarga e evita
   tela em branco. Não serializa dados ou erros internos para o usuário.
6. **Testes:** adicionados axe/WCAG 2 A/AA e 2.1 AA para demo, login, painel,
   histórico, formulário de cadastro e alertas nos dois temas; testes verificam
   ausência de escritas públicas, erro/repetição/vazio, teclado e preferência.
7. **Hospedagem:** `scripts/configure-vercel.cjs` gera rewrites com API antes da
   SPA, valida origem HTTPS sem credenciais/caminho e recusa destinos locais.
   O arquivo de exemplo não é uma publicação. O README detalha criação do projeto
   Vercel e validações necessárias; não contém URL inventada de produção.

### Evidências intermediárias

Build e 29 testes unitários aprovados. Prova real de demonstração aprovada com
build React, Express, fixture MySQL e conta demo de leitura; consulta sem login e
sem campos privados. Regressão real de histórico aprovada: 100 mil leituras,
20 linhas renderizadas, primeira página em 178 ms, CSV com 100.001 linhas e
reconhecimento de alerta persistido. Fixtures próprias removidas ao terminar;
nenhum seed nem conta foi criado no Aiven nesta fase.

Primeira análise axe encontrou link sem distinção visual no tema escuro: aplicado
sublinhado. Uma tentativa de teste interceptou módulos Vite por padrão de URL amplo;
o mock foi limitado a `/api/v1/**`. Outra tentativa sofreu recarga de HMR enquanto
os arquivos eram editados e foi descartada como aceite. Não se relaxaram regras axe.

Instalação de ferramentas precisou de `NODE_USE_SYSTEM_CA=1` neste Windows; a
verificação TLS continuou ativa. Firefox Playwright instalado, mas o executável
não iniciou (`spawn UNKNOWN`) inclusive fora do sandbox. Firefox será validado no
CI Linux. WebKit mobile é emulação automatizada; não comprova Safari em iPhone real.
Resultados finais da matriz e CI serão registrados no fechamento.

### Validações locais encerradas — 20/10/2026

45 cenários da Fase 6 aprovados: 15 em Chrome, 15 em Edge e 15 em WebKit mobile,
incluindo os 12 exames axe por navegador (seis telas × dois temas). Capturas de
demonstração e formulário móvel no tema escuro revisadas sem transbordamento.
A preferência de cor permaneceu após recarga; link de pular conteúdo foi ativado
por teclado. No perfil móvel, o teste usa foco assistido e ativação Enter (a política
de Tab do WebKit móvel difere do desktop); no desktop verifica a ordem natural Tab.
Isso não substitui a checagem de Safari/iPhone físico, que permanece pendente.

Uma execução anterior teve expectativas de contagem exata de GET incompatíveis
com o ciclo StrictMode; o teste passou a exigir uma nova consulta após atualizar,
preservando a garantia de somente GET e ausência de consulta de sessão. Também houve
timeouts locais e uma tentativa ampla interrompida durante aquecimento; não foram
contados como aprovação. A análise axe pode levar até 60 s incluindo captura e
processamento; esse prazo não altera os limites de desempenho da API/histórico.

Login, cartão da bancada Aiven, tema escuro/claro e logout aprovados na versão atual,
sem comandos físicos. O Node local foi reiniciado: consulta Aiven antes/depois
registrou 1.323 → 1.336 leituras e placa online com medição nova às 11:26:12 UTC
(08:26:12 em America/Bahia), 29,8 °C e 66% de umidade. A contagem é uma fotografia,
não uma promessa de disponibilidade contínua. Os dados reais permanecem no Aiven.

Código publicado no commit `4664832`. Backend CI 39415190014 aprovado; frontend
CI 39415190021 executa a regressão integral em Chromium, Firefox e WebKit mobile.
O resultado definitivo e eventuais correções serão registrados abaixo.

### Ajuste da matriz completa

Primeiro CI frontend 39415190021: 162/165 cenários aprovados, incluindo a Fase 6
nos três motores e Firefox Linux. As três falhas eram testes anteriores que
procuravam links do menu mobile fechado (perfis administrador/superadmin e saída
do detalhe para alertas). Testes passaram a abrir o menu conforme a largura antes
de inspecionar/navegar; regras de acesso, proteção de rotas e verificação SSE foram
preservadas. Foi acrescentada a resposta de empresas que faltava ao mock de login.
O resultado dessa execução não foi contado como aprovação integral.

### Encerramento técnico da execução — 20/10/2026

CI frontend aprovado na versão `598033e`:
https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39415983518.
Foram 29 testes unitários + 165 cenários (55 × Chromium/Firefox/WebKit mobile),
com os exames axe dos dois temas incluídos. Firefox foi validado no Linux do CI.
Build e instalação limpa `npm ci` aprovados. Backend CI 39415983669 aprovado com
122 testes. A primeira tentativa de CI com três falhas mobile está registrada;
o ajuste não alterou regras de autorização nem os limites de SSE/histórico.

Tentativas dirigidas no WebKit Windows também tiveram timeout ao carregar sessão
e uma seleção rápida de filtro antes da atualização da URL. Elas não foram
contadas como sucesso nem usadas para relaxar limites. O aceite automatizado da
versão publicada é a matriz integral aprovada no CI, além dos 45 cenários locais
de Fase 6 aprovados. As duas verificações ponta a ponta com MySQL local real e a
validação do painel Aiven permanecem evidências adicionais, não mocks de produção.

Parte técnica entregue e versionada. Permanecem pendentes: Safari/iPhone físico,
habilitação da demo no ambiente de destino com conta de leitura e dados fictícios,
URL HTTPS pública do backend, criação/publicação do projeto Vercel e aceite remoto
integrado. Logo, a Fase 6 **não foi marcada como integralmente concluída**. A Fase 7
do backend continua aberta e o fluxo real broker público → Node local → Aiven foi
preservado. Nenhum serviço pago foi contratado e nenhuma credencial foi publicada.
