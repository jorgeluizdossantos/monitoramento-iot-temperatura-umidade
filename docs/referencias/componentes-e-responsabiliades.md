
## 5. Componentes e Responsabilidades

**Firmware ESP32:**

- `sensor_dht` — leitura periódica validada (descarta NaN e valores fora dos limites físicos);
- `mqtt_client` — conexão TLS, publicação QoS 1, LWT armado com retain, reconexão com backoff;
- `wifi_manager` — reconexão não bloqueante;
- `config.h` — credenciais locais não versionadas.

**Backend:**

- **Serviço de Ingestão MQTT** — assina wildcard `empresa/+/unidade/+/ambiente/+/telemetria`; valida payload JSON; persiste leitura; atualiza `ultima_leitura_em`; dispara avaliação de alertas.
- **Serviço de Alertas** — compara leitura com faixas ideais do ambiente; insere registro em `alerta` quando violado.
- **API REST (Express)** — `POST /api/auth/login` (JWT, expiração 8 h); CRUDs por recurso; `/api/leituras` (filtros + paginação); `/api/alertas`. Middlewares: autenticação JWT, RBAC por perfil, validação de entrada, tratamento de erros centralizado.

**Frontend:**

- `mqtt-client.js` — conexão WSS, subscrição dos tópicos visíveis, reconexão com backoff;
- `api-client.js` — wrapper de `fetch` com token JWT e tratamento de 401;
- `dashboard.js` — cartões com cores por faixa (verde/amarelo/vermelho);
- `charts.js` — gráficos de linha (Chart.js);
- `auth.js` — login e sessão em `sessionStorage`;
- `ui.js` — navegação hierárquica, filtros, modais de CRUD.

**Simulador MQTT (`scripts/simulador-mqtt.js`)** — publica telemetria fictícia fiel ao contrato para demonstração sem hardware.

## 6. Interfaces entre Módulos

**Contrato MQTT:**

- Tópicos: `empresa/{empresa_id}/unidade/{unidade_id}/ambiente/{ambiente_id}/telemetria` e `dispositivo/{dispositivo_id}/status`;
- Payload: `{"dispositivo":"ESP32-A1","temperatura":24.6,"umidade":58.2,"timestamp":"ISO-8601"}`;
- QoS 1; LWT publica `{"status":"offline"}` com retain.

**Contrato API REST:**

- Autenticação: header `Authorization: Bearer <JWT>`;
- Resposta padronizada: `{"sucesso":true,"dados":[...],"erro":null}`;
- Códigos HTTP: 200, 201, 400, 401, 403, 404, 500;
- Paginação: `?pagina=1&limite=50`.

**Contrato Frontend ↔ API:** token em `sessionStorage`; 401 limpa credenciais e redireciona ao login.

**Contrato Frontend ↔ Broker:** MQTT.js sobre WSS; credenciais de leitura limitadas via ACL do broker [A CONFIRMAR].

**Contrato Backend ↔ MySQL:** camada de repositories com queries parametrizadas (prevenção de SQL injection); pool de conexões.

## 7. Fluxos e Interações Principais

**Fluxo 1 — Telemetria em tempo real:**
ESP32 lê DHT22 → publica JSON no tópico → broker roteia → serviço de ingestão valida e persiste → avalia alertas → navegador (assinado no tópico) recebe via WSS e atualiza cartão/gráfico sem recarga.

**Fluxo 2 — Consulta histórica:**
usuário seleciona ambiente e período → `GET /api/leituras` → backend valida JWT e perfil → repository consulta com índice `(ambiente_id, lida_em)` → resposta paginada → frontend renderiza tabela e gráfico.

**Fluxo 3 — Autenticação:**
login → `POST /api/auth/login` → verificação de hash (bcrypt) → emissão de JWT → armazenamento em `sessionStorage` → uso em todas as chamadas → logout invalida localmente.

**Fluxo 4 — Detecção de dispositivo offline:**
ESP32 cai sem desconexão formal → broker publica LWT → ingestão registra status offline → dashboard exibe indicador.

**Fluxo 5 — Cadastro hierárquico:**
administrador cria empresa → unidade → setor → ambiente → dispositivo; validação de vínculo em cada nível; exclusão lógica quando houver histórico.

## 8. Dependências e Integrações

| Camada | Tecnologia | Finalidade |
|---|---|---|
| ESP32 | Arduino Core, PubSubClient, DHT sensor library | Firmware e mensageria |
| Backend | Node.js 18+, Express, mysql2, jsonwebtoken, bcryptjs, mqtt, dotenv | API, ingestão e persistência |
| Frontend | Tailwind CSS, Chart.js, MQTT.js (via CDN) | Estilo, gráficos e tempo real |
| Infraestrutura | MySQL 8, HiveMQ Cloud/Mosquitto, Render/Railway [A CONFIRMAR] | Banco, broker e hospedagem |
| Versionamento | Git/GitHub | Controle de versão |

> **Contingência de CDN:** manter cópias locais em `frontend/vendor/` caso CDNs públicas fiquem indisponíveis na apresentação.

## 9. Regras, Restrições e Premissas

**Premissas:** backend Node.js/Express definido nesta fase [A CONFIRMAR na validação]; broker com suporte a WebSockets; internet disponível para demonstração.

**Restrições:** frontend exclusivamente HTML/JS/CSS + Tailwind (sem React/Vue); MySQL como único SGBD; credenciais fora do repositório; orçamento zero (serviços gratuitos).

**Regras técnicas de design:**

- Exclusão lógica em todos os cadastros com histórico;
- Validação de entrada no frontend **e** no backend (defesa em profundidade);
- Timestamps em UTC no banco, exibição em horário local no frontend;
- IDs numéricos auto-incremento.

## 10. Escalabilidade, Manutenibilidade, Testabilidade e Evolução

- **Escalabilidade:** índice composto na telemetria; particionamento futuro por data; pool de conexões; múltiplas instâncias de ingestão via Shared Subscriptions do MQTT v5.
- **Manutenibilidade:** camadas rotas → serviços → repositories; configuração centralizada via variáveis de ambiente; nomenclatura consistente.
- **Testabilidade:** módulos desacoplados permitem testes unitários; simulador MQTT permite teste ponta a ponta sem hardware; coleção Postman/Insomnia documentada.
- **Evolução futura:** 2FA, particionamento de telemetria, notificações por e-mail/WhatsApp, PWA, migração para TypeScript, Docker.

## 11. Riscos e Pontos de Atenção

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| CDN indisponível em demonstração | Média | Médio | Vendor local em `frontend/vendor/` |
| Bloqueio de portas MQTT em rede acadêmica | Média | Alto | Broker em nuvem com TLS 8883/8884 |
| Crescimento descontrolado da telemetria | Média | Médio | Índices e política de expurgo |
| Credenciais expostas no Git | Baixa | Alto | `.env` ignorado, revisão de commits |
| Perda de mensagens MQTT | Baixa | Médio | QoS 1 e idempotência na ingestão |
| Complexidade excessiva para o prazo | Média | Médio | Escopo Must primeiro, Should/Could depois |

## 12. Decisões Justificadas

| Decisão | Alternativas | Justificativa |
|---|---|---|
| Backend Node.js/Express | PHP, Python Flask | Linguagem unificada com o frontend, ecossistema maduro para MQTT e MySQL |
| MQTT over WebSockets direto no navegador | Polling da API, SSE | Latência menor, atende ao requisito de 5 s sem sobrecarregar o servidor |
| JWT em sessionStorage | Cookies HTTP-only, localStorage | Sessão encerra ao fechar a aba; adequado a quiosques [A CONFIRMAR implicações de XSS] |
| Tailwind via CDN | Build com Tailwind CLI | Execução simples por avaliadores, sem etapa de build |
| Exclusão lógica | Exclusão física | Integridade do histórico (RN004) |
| HiveMQ Cloud | Mosquitto local | Demonstração pública sem infraestrutura própria |
| Chart.js | D3.js, Plotly | Simplicidade e adequação ao escopo |

## 13. Conclusão

O design define uma arquitetura em camadas simples, segura e testável, adequada ao propósito de portfólio e aderente aos requisitos. **Próximos passos:** validação deste documento, setup do repositório e implementação em incrementos (firmware → backend → frontend → integração), conforme o plano de implementação.

## 14. Controle de Versão

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | 03/10/2026 | Aluno (Projetista de Sistemas) | Emissão inicial do documento de projeto (design) |