# Plano de Implementação — Sistema Web de Monitoramento IoT de Temperatura e Umidade

> Projeto de Portfólio — Monitoramento IoT com ESP32 e MQTT
> Versão 1.0 — 04/10/2026

---

## 1. Visão Geral do Plano

O plano de implementação estabelece o roteiro operacional para a construção do sistema web responsivo integrado à solução de monitoramento ambiental por IoT. A execução adota o princípio arquitetural **contrato antes de consumidor**: nenhuma camada consumidora inicia seu desenvolvimento sem que os contratos de interface, esquemas de dados e serviços provedores estejam concluídos, validados e testáveis.

**Ordem construtiva:**

1. Setup de repositório e infraestrutura base
2. Backend fundacional (banco de dados, autenticação e serviços CRUD)
3. Ingestão MQTT e motor de alertas
4. Firmware embarcado no ESP32
5. Frontend web responsivo
6. Integração ponta a ponta (telemetria física e sintética)
7. Qualidade, deploy em nuvem e empacotamento do portfólio no GitHub

Essa segregação garante que cada incremento represente uma entrega técnica demonstrável de forma isolada, com histórico de commits semânticos rastreáveis — fator determinante para a avaliação do portfólio por recrutadores da indústria de automação.

## 2. Objetivos do Plano

Converter os requisitos formais (RF001–RF017, RNF001–RNF008, RN001–RN007) e o modelo de arquitetura em tarefas técnicas executáveis, sequenciadas logicamente e parametrizadas por esforço, dependências e critérios de aceite.

O foco central é a entrega rigorosa do **MVP**, delimitado pelos requisitos **Must** (RF001–RF011 e RNF001–RNF008). Os requisitos **Should/Could** (RF012–RF017) ficam condicionados à conclusão prévia do marco M3, protegendo o cronograma do processo seletivo.

## 3. Fases de Implementação

### Fase 0 — Setup do Repositório e Ambiente (˜ 4 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T0.1 | Criar repositório GitHub com diretórios-raiz (docs/, firmware/, backend/, frontend/, scripts/), .gitignore, licença MIT e README.md estrutural | 1 h | Nenhuma |
| T0.2 | Provisionar broker MQTT (HiveMQ Cloud) com TLS nas portas 8883/8884, credenciais em .env local | 1 h | T0.1 |
| T0.3 | Instalar MySQL 8 local, executar scripts/schema.sql e carregar scripts/seed.sql (com hash bcrypt real) | 1 h | T0.1 |
| T0.4 | Configurar Node.js 18 LTS, inicializar backend/ e instalar dependências (express, mysql2, jsonwebtoken, bcryptjs, mqtt, dotenv) | 1 h | T0.3 |

> **Critério de conclusão:** repositório clonável, banco MySQL operacional com seed populado e conectividade com o broker confirmada via ping de autenticação.

### Fase 1 — Backend Fundacional (˜ 16 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T1.1 | config/ — carregador de ambiente (env.js) com validação de chaves e pool MySQL (database.js) | 2 h | T0.4 |
| T1.2 | Camada repositories/ — db.js e 8 repositórios com queries parametrizadas (empresa, unidade, setor, ambiente, dispositivo, usuario, leitura, alerta) | 4 h | T1.1 |
| T1.3 | services/auth.service.js — login com bcrypt, emissão de JWT (expiração 8 h) e verificação de token | 2 h | T1.2 |
| T1.4 | Middlewares — autenticacao (JWT Bearer), rbac (administrador/operador/leitor) e tratamento global de erros em JSON padronizado | 2 h | T1.3 |
| T1.5 | Rotas CRUD — /api/empresas, /api/unidades, /api/setores, /api/ambientes, /api/dispositivos, /api/usuarios — com validação de vínculo hierárquico e exclusão lógica | 4 h | T1.4 |
| T1.6 | Rota /api/leituras — filtros (ambiente_id, data_inicio, data_fim) e paginação (pagina, limite) amparada no índice composto | 2 h | T1.5 |

> **Critério de conclusão:** todos os endpoints respondendo conforme o contrato REST (seção 6.2 do design); testes via Postman/Insomnia cobrem CRUD completo e casos de erro (400, 401, 403, 404).

### Fase 2 — Ingestão MQTT e Alertas (˜ 8 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T2.1 | config/mqtt.js — conexão persistente TLS ao broker, subscrição do wildcard empresa/+/unidade/+/ambiente/+/telemetria e tópicos de status | 2 h | T1.2 |
| T2.2 | services/ingestao-mqtt.service.js — validação do payload JSON, resolução do dispositivo por identificador_unico, persistência em leitura_telemetria e atualização de ultima_leitura_em | 3 h | T2.1 |
| T2.3 | services/alertas.service.js — comparação com faixas ideais do ambiente e inserção em alerta quando violado (RN005) | 1,5 h | T2.2 |
| T2.4 | Tratador de LWT — atualização automática de status do dispositivo (online/offline) no tópico dispositivo/{id}/status | 1,5 h | T2.2 |

> **Critério de conclusão:** injeção manual de payload de teste no broker (MQTT Explorer ou CLI) gera linha em leitura_telemetria e, quando fora da faixa, linha em alerta.

### Fase 3 — Firmware ESP32 (˜ 10 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T3.1 | Configurar ambiente de compilação (Arduino IDE ou PlatformIO) e homologar bibliotecas PubSubClient e Adafruit DHT Sensor | 1 h | Nenhuma |
| T3.2 | Módulo sensor_dht — leitura validada com descarte de NaN e valores fora dos limites físicos (-40 a 80 °C, 0 a 100%) | 2 h | T3.1 |
| T3.3 | Módulo wifi_manager — reconexão não bloqueante com backoff de 5 s | 1,5 h | T3.1 |
| T3.4 | Módulo mqtt_client — conexão TLS, LWT armado com retain, publicação QoS 1 e rotinas de reconexão | 3 h | T3.1, T0.2 |
| T3.5 | main.cpp — loop não bloqueante, montagem de tópicos via config.h, payload JSON com timestamp NTP (UTC, ISO-8601) e publicação a cada 30 s | 2,5 h | T3.2, T3.3, T3.4 |

> **Critério de conclusão:** leituras do DHT22 persistidas no MySQL em até 5 s (RNF002) e desenergização do ESP32 dispara o LWT offline visível no banco.

### Fase 4 — Frontend (˜ 20 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T4.1 | Layout base mobile-first com Tailwind via CDN: index.html (login) e grids para 360 px, 768 px e 1024 px | 2 h | Nenhuma |
| T4.2 | js/auth.js + js/api-client.js — token em sessionStorage, wrapper de fetch e interceptação de 401 | 3 h | T1.3 |
| T4.3 | cadastros.html + ui.js — CRUD das 6 entidades, navegação hierárquica, modais e restrições por perfil (RF015) | 6 h | T1.5, T4.2 |
| T4.4 | js/mqtt-client.js — conexão WSS via MQTT.js, subscrição dos tópicos permitidos, reconexão com backoff e indicador de conexão | 3 h | T0.2 |
| T4.5 | dashboard.html + dashboard.js — cartões com cores dinâmicas (verde/amarelo/vermelho), atualização sem recarga e indicador online/offline | 4 h | T4.4 |
| T4.6 | historico.html + charts.js — filtros por ambiente e período, tabela paginada e gráficos de linha com Chart.js (RF011, RF012) | 2 h | T1.6, T4.2 |

> **Critério de conclusão:** fluxo completo navegável em viewport de 360 px sem rolagem horizontal (RNF001): login ? cadastros ? dashboard em tempo real ? histórico com gráfico.

### Fase 5 — Integração Ponta a Ponta (˜ 6 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T5.1 | scripts/simulador-mqtt.js — telemetria sintética fiel ao contrato, com alternância proposital de leituras normais e anômalas | 2 h | T2.2 |
| T5.2 | Homologação conjunta — ESP32 real + simulador em paralelo, cobrindo os 5 fluxos do design (telemetria, histórico, autenticação, LWT, cadastros) | 2 h | T3.5, T4.6 |
| T5.3 | Otimização de tráfego, correção de inconsistências e ajustes de tempo de resposta | 2 h | T5.2 |

> **Critério de conclusão:** leitura física ou simulada visível no dashboard em = 5 s, com sinalização visual imediata de desvio de faixa.

### Fase 6 — Qualidade, Deploy e Portfólio (˜ 8 h)

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| T6.1 | Coleção de testes de API (Postman/Insomnia) documentada e versionada em docs/ | 2 h | T1.6 |
| T6.2 | Deploy do backend em Render/Railway + banco gerenciado [A CONFIRMAR]; frontend em hospedagem estática | 2 h | T5.3 |
| T6.3 | README.md final — diagrama de arquitetura, GIF do dashboard, guia "Como Executar" e roadmap | 2 h | T6.2 |
| T6.4 | Auditoria do repositório — Conventional Commits, .gitignore validado, sem credenciais no histórico, docs/ unificada | 2 h | T6.3 |

> **Critério de conclusão:** repositório estruturado, sem credenciais expostas no histórico do Git, e demonstração em nuvem acessível publicamente.

## 4. Marcos e Cronograma

| Marco | Escopo Contemplado | Esforço Acumulado |
|---|---|---|
| M1 — Fundação Pronta | Fases 0–1: banco estruturado, autenticação e CRUDs testados | ˜ 20 h |
| M2 — Dados Fluindo | Fases 2–3: telemetria do ESP32 gravada no MySQL | ˜ 38 h |
| M3 — Produto Visível (MVP) | Fases 4–5: dashboard integrado em tempo real | ˜ 64 h |
| M4 — Portfólio Entregue | Fase 6: deploy, documentação e repositório homologado | ˜ 72 h |

O esforço global de **˜ 72 h** é viável em **4 a 6 semanas** no ritmo de 3–4 sessões semanais de 2 h, compatível com a rotina de um curso técnico. As Fases 4 e 5 concentram a maior carga; o congelamento dos itens Should/Could (RF012–RF017) resguarda o MVP no marco M3 em caso de imprevistos.

## 5. Estratégia de Testes por Fase

1. **Backend (API REST):** testes via Postman a cada endpoint, incluindo casos de borda — payloads incompletos (400), ausência de credenciais (401), permissões insuficientes (403) e quebra de hierarquia (RN002).
2. **Ingestão MQTT:** injeção de payloads válidos, JSONs truncados e mensagens duplicadas, comprovando idempotência sob QoS 1.
3. **Firmware:** monitor serial (115200 bps), verificação de persistência no banco e teste físico de desenergização para confirmar o LWT retido.
4. **Frontend:** validação em Chrome, Firefox, Edge e Safari Mobile (RNF004); ausência de rolagem horizontal em 360 px (RNF001); teste de queda de rede para o indicador de reconexão.
5. **Integração global:** roteiro fixo dos 5 fluxos do design, executado antes de cada fechamento de marco.

## 6. Definition of Done Global

Um incremento só é concluído quando:

1. O critério de aceitação do requisito correspondente foi verificado e registrado.
2. O código foi commitado com mensagem Conventional Commit (`feat:`, `fix:`, `docs:`, `refactor:`).
3. Nenhuma credencial, `.env` ou certificado entrou no repositório Git.
4. A documentação associada (README ou docs/) foi atualizada.

## 7. Riscos do Plano

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Subestimação de esforço no frontend (maior fase) | Média | Médio | Margem de 20% no cronograma do M3 e postergação de RF012–RF017 |
| Indisponibilidade ou defeito do hardware ESP32 | Média | Médio | Simulador MQTT (T5.1) como fallback completo de demonstração |
| Bloqueio das portas MQTT (1883/8883) em rede acadêmica | Média | Alto | Broker em nuvem com TLS (8883) e WebSockets (8884/443) |
| CDN indisponível durante a apresentação | Média | Médio | Cópia local de Tailwind, MQTT.js e Chart.js em frontend/vendor/ |
| Sobreposição com avaliações acadêmicas e entrevistas | Média | Médio | Priorização MoSCoW e marcos independentes, protegendo o MVP |

## 8. Conclusão

O plano articula 7 fases em 4 marcos, com ˜ 72 h de esforço estimado, ordenado por dependência de contratos e com critérios de conclusão verificáveis alinhados aos requisitos e fluxos do design. O MVP fecha os requisitos Must; os itens Should/Could ficam para pós-M3. A integração assistida por simulador e o rigor de versionamento consolidam o projeto como portfólio de engenharia de software e automação industrial no GitHub.

## 9. Controle de Versão

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | 04/10/2026 | Aluno (Redator de Requisitos) | Emissão inicial do plano de implementação |