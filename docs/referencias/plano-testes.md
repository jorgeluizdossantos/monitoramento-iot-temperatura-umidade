# Plano de Testes — Sistema Web de Monitoramento IoT de Temperatura e Umidade

> Projeto de Portfólio — Monitoramento IoT com ESP32 e MQTT
> Versão 1.0 — 04/10/2026

---

## 1. Introdução e Objetivo

Este plano define a estratégia, o escopo, o ambiente, os critérios e os artefatos de teste do sistema. O objetivo é verificar e validar que os requisitos especificados foram atendidos, com ênfase na integração ponta a ponta (Fase 5 do plano de implementação).

**Referências:**

- Documento de Requisitos v1.0
- Documento de Projeto (Design) v1.0
- Plano de Implementação v1.0

## 2. Escopo de Testes

**Incluído:**

- Testes funcionais da API REST (CRUDs, autenticação, histórico, alertas);
- Testes da ingestão MQTT (payloads válidos, malformados, duplicados);
- Testes do firmware (leitura, publicação, LWT, reconexão);
- Testes de interface (responsividade, navegadores, tempo real);
- Testes de segurança básicos (JWT, RBAC, credenciais);
- Teste ponta a ponta dos 5 fluxos principais.

**Fora de escopo:** testes de carga intensiva; testes de penetração completos; aplicativos nativos; automação E2E com Selenium/Cypress (registrado como evolução futura).

## 3. Estratégia de Testes

**Níveis:**

1. **Unitário** — serviços e repositórios do backend; funções do frontend (execução manual assistida e, quando viável, scripts Node).
2. **Integração** — API ? MySQL; ingestão MQTT ? MySQL; firmware ? broker.
3. **Sistema** — fluxos completos ponta a ponta.
4. **Aceitação** — roteiro de demonstração do portfólio.

**Tipos:** funcionais; não funcionais (desempenho, compatibilidade, confiabilidade); segurança básica; usabilidade/responsividade.

**Abordagem:** testes manuais estruturados com casos documentados (documento complementar de Casos de Teste), apoiados por Postman/Insomnia (API), MQTT Explorer/CLI mosquitto (broker), monitor serial (firmware) e DevTools dos navegadores (frontend).

## 4. Ambiente de Teste

| Componente | Especificação | Função |
|---|---|---|
| Banco de dados | MySQL 8 local ou gerenciado | Persistência transacional |
| Backend | Node.js 18+ LTS / Express 4.x | API REST, ingestão MQTT, alertas |
| Broker principal | HiveMQ Cloud (TLS 8883 / WSS 8884) | Mensageria MQTT |
| Broker alternativo | Mosquitto 2.x local | Contingência |
| Hardware | ESP32 DevKit + DHT22 | Aquisição e publicação |
| Simulador | scripts/simulador-mqtt.js | Telemetria sintética sem hardware |
| Navegadores | Chrome, Firefox, Edge, Safari Mobile | Homologação de interface |
| Dispositivos físicos | Smartphone (360 px), tablet (768 px), desktop (=1024 px) | Responsividade |

**Dados de teste:** `scripts/schema.sql` + `scripts/seed.sql` (empresas, unidades, setores, ambientes com faixas ideais, dispositivos e usuários dos três perfis).

## 5. Critérios de Entrada e Saída

**Entrada:** código commitado na branch de teste; schema e seed executados; broker acessível; casos de teste revisados.

**Saída:**

- 100% dos casos Must executados com evidência;
- Zero defeitos críticos/altos abertos;
- Defeitos médios/baixos registrados com plano de correção;
- Métrica RNF002 (= 5 s) comprovada;
- Roteiro ponta a ponta executado com sucesso integral.

## 6. Matriz de Rastreabilidade Requisito ? Teste

| Requisito | Escopo | Casos de Teste |
|---|---|---|
| RF001 | Autenticação e sessão | CT001–CT004 |
| RF002–RF007 | CRUDs e hierarquia | CT005–CT016 (+CT016A) |
| RF008 | Ingestão MQTT | CT017–CT020 (+CT020B) |
| RF009 | Dashboard tempo real | CT021–CT022 |
| RF010 | Multiempresa/hierarquia | CT023 |
| RF011 | Histórico | CT024–CT026 |
| RF012 | Gráficos | CT027 |
| RF013 | Alertas | CT028–CT029 |
| RF014 | Status online/offline | CT030–CT031 |
| RF015 | Perfis de acesso | CT032–CT034 |
| RF016 | Exportação CSV | CT035 |
| RF017 | Modo demonstração | CT036 |
| RNF001 | Responsividade | CT037–CT038 |
| RNF002 | Latência = 5 s | CT039 |
| RNF003 | Segurança | CT040–CT041 |
| RNF004 | Compatibilidade | CT042 |
| RNF005 | Confiabilidade/reconexão | CT043–CT044 |
| RNF006 | Manutenibilidade | CT045 |
| RNF007 | Desempenho consulta | CT046 |
| RNF008 | Portabilidade | CT047 |

## 7. Testes por Camada

**Backend/API:** CRUD completo por entidade; validação de vínculo hierárquico; exclusão lógica; códigos de erro (400/401/403/404/500); paginação; JWT expirado/inválido; RBAC por perfil.

**Ingestão MQTT:** payload válido persistido; JSON malformado rejeitado sem crash; campos ausentes rejeitados; valores fisicamente impossíveis rejeitados; mensagem duplicada (QoS 1) não gera leitura duplicada (idempotência por timestamp + dispositivo); dispositivo inexistente tratado com log.

**Firmware:** leitura válida do DHT22; descarte de NaN; reconexão Wi-Fi; reconexão MQTT com backoff; LWT publicado em queda de energia; timestamp NTP em UTC.

**Frontend:** login/logout; atualização em tempo real sem recarga; cores dos cartões por faixa (verde/amarelo/vermelho); gráficos renderizados; filtros de histórico; indicador de conexão MQTT; reconexão após queda de rede; bloqueio de ações por perfil.

## 8. Dados e Ferramentas de Teste

| Ferramenta | Finalidade |
|---|---|
| Postman/Insomnia | Chamadas REST (coleção versionada em docs/) |
| MQTT Explorer / mosquitto_pub-sub | Inspeção e injeção de mensagens no broker |
| scripts/simulador-mqtt.js | Telemetria sintética com leituras normais e anômalas |
| Monitor serial (Arduino/PlatformIO) | Depuração do firmware (115200 bps) |
| DevTools | Emulação de viewport (360 px), throttling de rede |
| Cronômetro | Medição de latência ponta a ponta |

## 9. Gestão de Defeitos

**Severidade:**

- **Crítico:** sistema inoperante, perda de dados, crash de backend/firmware;
- **Alto:** funcionalidade principal falha sem contorno;
- **Médio:** funcionalidade degrada com contorno;
- **Baixo:** cosmético/menor.

**Fluxo:** registro (issue no GitHub com template de bug) ? reprodução ? correção em branch dedicada ? reteste ? fechamento com commit `fix:`.

## 10. Critérios de Suspensão e Retomada

**Suspensão:** broker indisponível; banco inacessível; mais de 50% dos casos bloqueados.

**Retomada:** ambiente restabelecido; correção homologada; smoke test de autenticação e comunicação aprovado.

## 11. Entregáveis de Teste

- Documento de casos de teste (CT001–CT047);
- Coleção Postman/Insomnia;
- Roteiro ponta a ponta da Fase 5 (checklist);
- Planilha/issues de defeitos;
- Relatório final de execução com evidências (prints/GIF para o README).

## 12. Riscos do Plano de Teste

| Risco | Mitigação |
|---|---|
| Indisponibilidade do hardware ESP32 | Simulador cobre os fluxos de telemetria |
| Bloqueio de portas MQTT na rede | Broker em nuvem com TLS 8883/8884 |
| CDN indisponível | Vendor local em frontend/vendor/ |
| Tempo limitado | Priorização MoSCoW dos casos (Must primeiro) |

## 13. Cronograma de Testes

Alinhado ao plano de implementação: Fase 1 (API — CT001–CT016, CT032–CT034); Fase 2 (ingestão — CT017–CT020, CT028–CT031); Fase 3 (firmware); Fase 4 (frontend — CT021–CT027, CT037–CT038); Fase 5 (ponta a ponta); Fase 6 (regressão final e evidências).

## 14. Controle de Versão

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | 04/10/2026 | Aluno (Redator de Requisitos/QA) | Emissão inicial do plano de testes |