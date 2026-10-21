# Frontend STMA — execução e implantação

React 18, Vite e TypeScript. Cadastros, painel autenticado, SSE, porta, LED,
histórico/CSV, gráficos e alertas usam a API Express. Dados reais seguem o fluxo
ESP32 → broker público → backend local → MySQL Aiven → API → frontend.

## Rodar o MVP já configurado

Na raiz do repositório, em dois terminais:

```powershell
npm --prefix backend ci
npm --prefix backend run dev:mvp
```

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev
```

Abra http://127.0.0.1:5173. Não misture esse endereço com localhost nas sessões.
O perfil privado `.env.mvp` mantém o Aiven e HiveMQ público; o guia de configuração
é [MVP de bancada](../docs/mvp-bancada-aiven.md). Não sobrescreva arquivos `.env`
existentes. `API_PROXY_TARGET` em `frontend/.env.local` pode apontar a outra API
local. Nenhuma senha de banco, Wi-Fi ou MQTT pode ser configurada no frontend.

As contas da aplicação precisam existir no banco selecionado. Neste laboratório,
os acessos Aiven ficam em `backend/.local/acessos-mvp-aiven.txt`, arquivo privado.
Não há senha universal nem senha publicada no GitHub. Para instalação nova,
crie o primeiro superadmin pelo procedimento de bootstrap do roteiro do backend
(e não por campos `VITE_*`); ele cria a empresa e seu administrador pela interface.

## Instalação nova por outro desenvolvedor

1. Clone o repositório e instale Node.js 22.12 ou superior na linha 22.
2. Execute `npm --prefix backend ci` e `npm --prefix frontend ci`.
3. Siga o [README principal](../README.md) para configurar MySQL local ou Aiven,
   aplicar as migrações e criar o primeiro usuário. Para Aiven, use sua própria CA.
4. Confira `PUBLIC_ORIGIN=http://127.0.0.1:5173` e
   `SESSION_COOKIE_SECURE=false` somente no desenvolvimento HTTP local.
5. Inicie backend e frontend conforme os comandos acima. Para funcionar sem MQTT,
   a aplicação permite consultar cadastros/históricos existentes com MQTT desativado;
   dados atuais exigem dispositivo, broker e ingestão em execução.

## Demonstração pública prevista em RF017

`/demo` consulta exclusivamente `GET /api/v1/demo/painel`, sem login. Exibe dados
fictícios cadastrados como demonstração no MySQL. Não há simulação estática no
frontend, controle de LED, edição ou acesso a placas reais por essa página.
O cliente não permite escolher empresa nem envia filtros para a API pública.

O backend precisa de `DEMO_ENABLED=true` e conta separada `DB_LOCAL_DEMO_*` ou
`DB_AIVEN_DEMO_*`, somente de leitura. A configuração e o seed explícito estão no
roteiro do backend. Não ative demo no Aiven para mostrar a empresa da bancada:
o dispositivo físico continua no painel autenticado. No perfil MVP atual,
a demonstração pública permanece desabilitada até configurar seus dados e conta.
Quando indisponível, `/demo` mostra aviso e permite repetir; nunca substitui dados
reais por valores inventados. A prova local descrita abaixo cria seus próprios
dados fictícios temporários e os remove ao terminar.

## Testes

```powershell
cd frontend
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
# Matriz do CI: Chromium, Firefox e WebKit no perfil iPhone 13
$env:PLAYWRIGHT_MATRIX='ci'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_MATRIX
# Matriz local acrescenta Chrome e Edge instalados
$env:PLAYWRIGHT_MATRIX='local'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_MATRIX
```

Os testes de interface usam respostas controladas da API e axe/WCAG A/AA nas telas
principais, com temas claro e escuro. WebKit emulado não substitui uma validação
manual em iPhone/Safari real. Testes de navegador não exigem ESP32.

Provas contra API, build e MySQL locais reais, na raiz (backend compilado,
`.env.test` local e conta demo de leitura configurados):

```powershell
npm --prefix backend run build
node scripts/verify-frontend-demo.cjs
node scripts/verify-frontend-history.cjs
```

Esses scripts recusam Aiven e criam/removem somente suas próprias fixtures. O teste
de histórico verifica 100 mil leituras, CSV completo e reconhecimento persistido.
A revisão automática cobre somente as condições exercitadas, não é certificação
integral de acessibilidade. Teste também navegação por teclado e leitor de tela.

## Vercel — preparar e publicar quando a API estiver acessível

O projeto ainda não foi criado na conta Vercel do proprietário. O deploy completo
continua pendente porque a API está no computador local. A Vercel não consegue
encaminhar requisições para `127.0.0.1` desse computador; o Aiven oferece MySQL,
não executa Express. Publicar os arquivos estáticos isoladamente não disponibiliza
login, dados reais, SSE, comandos ou a demonstração que depende da API.

Quando existir a origem HTTPS pública da API:

1. No diretório `frontend`, gere a configuração:

   ```powershell
   npm run configure:vercel -- https://ENDERECO-PUBLICO-DA-API
   ```

   Substitua o endereço por uma origem real, sem caminho, usuário ou senha.
   `vercel.example.json` é referência; o gerador cria `vercel.json`. Confira e
   versione esse arquivo antes de importar o projeto. Não publique o domínio de
   exemplo. Os rewrites da API/health precedem o fallback de rotas React.
2. Na Vercel: **Add New → Project → Import Git Repository**. Selecione
   `jorgeluizdossantos/monitoramento-iot-temperatura-umidade` e nomeie o projeto
   `monitoramento-iot-temperatura-umidade` (se disponível na sua conta).
3. Defina **Root Directory = frontend**, **Framework Preset = Vite**,
   **Build Command = npm run build**, **Output Directory = dist**,
   **Install Command = npm ci**, runtime Node.js 22.x.
4. No backend, configure `NODE_ENV=production`, `SESSION_COOKIE_SECURE=true` e
   `PUBLIC_ORIGIN=https://DOMINIO-DO-FRONTEND`. As proteções de broker de produção
   exigem autenticação/TLS; concluir esse perfil pertence à Fase 7 do backend.
5. Publique primeiro uma prévia; confira `/entrar`, acesso direto/reload em rotas
   internas, login, logout, cookies HttpOnly/Secure, consulta à API e SSE/fallback.
   A origem de produção do backend deve corresponder ao domínio definitivo; uma
   prévia com outro domínio não deve ganhar permissão automaticamente.
6. Valide painel com leitura física, CSV, perfis e bloqueios antes do aceite.
   Confira duração/reconexão do SSE pelo proxy. Só então libere a implantação final.

Não há CORS amplo: navegador usa `/api` na própria origem, e o rewrite encaminha
para Express. A CA e as senhas ficam somente no backend. O gerador valida a origem
e não recebe credenciais. Seguem pendentes a hospedagem contínua do Node, o perfil
MQTT privado/TLS de produção e a validação remota integrada.

Referências oficiais: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[rewrites](https://vercel.com/docs/routing/rewrites),
[navegadores Playwright](https://playwright.dev/docs/browsers) e
[acessibilidade com axe](https://playwright.dev/docs/accessibility-testing).

Roteiro didático: [roteiro-frontend](../docs/roteiro-frontend.md).

A execução técnica da Fase 6 foi validada: 29 testes unitários e 165 cenários em
Chromium, Firefox e WebKit mobile, com axe nos dois temas. CI de referência:
[39415983518](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade/actions/runs/39415983518).
O aceite completo continua dependente de Safari/iPhone físico e implantação remota.

Para o aceite no aparelho real, use [roteiro Safari/iPadOS](../docs/aceite-safari-fase6.md).
Ele permite testar pela mesma rede Wi-Fi antes de existir deploy público, com
origem autorizada temporária e instruções de restauração. Sua execução permanece pendente.
