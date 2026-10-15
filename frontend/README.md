# Frontend STMA — Fase 2

React 18, Vite, TypeScript estrito e Tailwind. Layout Telemetry Slate, menu responsivo,
login real, sessão HttpOnly, rotas protegidas e menus por perfil. Painel e cadastros funcionais nas fases seguintes.

```powershell
cd frontend
npm ci
npm run dev
```

Abra http://127.0.0.1:5173. O proxy local encaminha `/api` e `/health` ao backend
http://127.0.0.1:3000. `API_PROXY_TARGET` pode ser definido em `.env.local`;
não é uma variável pública `VITE_*`. Nunca coloque senhas do MySQL/MQTT no frontend.

Para login e logout, inicie o backend com `PUBLIC_ORIGIN=http://127.0.0.1:5173`
e `SESSION_COOKIE_SECURE=false` somente no desenvolvimento HTTP local. Não misture
localhost com 127.0.0.1. O proxy preserva Origin; a proteção do backend continua ativa.

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

O navegador de teste verifica navegação e ausência de transbordamento em 360, 768 e 1440 px.
O CI faz os mesmos checks com `npm ci`. Build não publica o site; o rewrite de produção
depende do endereço definitivo do backend na Fase 6 do frontend.

Roteiro didático: [docs/roteiro-frontend.md](../docs/roteiro-frontend.md).
