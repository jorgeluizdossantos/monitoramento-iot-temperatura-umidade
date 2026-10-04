# Documento de Requisitos — Sistema Web de Monitoramento IoT de Temperatura e Umidade

> Projeto de Portfólio — Monitoramento IoT com ESP32 e MQTT
> Versão 1.0 — 03/10/2026

---

## 1. Visão Geral do Sistema

Plataforma web responsiva (mobile-first) que conecta dispositivos IoT baseados em **ESP32** com sensor de temperatura e umidade a um painel de controle central, permitindo monitoramento remoto em tempo real e consulta histórica em múltiplas empresas, unidades, setores e ambientes.

A arquitetura organiza-se em três camadas:

- **Camada de Sensoriamento:** ESP32 + sensor DHT22 publica leituras via protocolo MQTT em formato JSON.
- **Camada de Persistência:** Broker MQTT + backend/API + banco de dados MySQL (dados cadastrais e telemetria).
- **Camada de Apresentação:** Dashboard web em HTML, JavaScript e CSS (Tailwind CSS), com atualização em tempo real via MQTT over WebSockets.

## 2. Objetivo do Projeto

**Objetivo geral:** demonstrar, de forma prática e verificável, competências em desenvolvimento web front-end, integração IoT/MQTT, modelagem de dados e versionamento (GitHub), servindo como diferencial em processo seletivo de estágio em empresa de automação industrial e projetos elétricos industriais.

**Métricas de sucesso:**

- Leitura exibida no dashboard em até **5 segundos** após publicação no broker;
- 100% dos cadastros operáveis via interface web;
- Histórico consultável por período e ambiente;
- Repositório com README completo, commits organizados e sem credenciais expostas.

## 3. Público-Alvo

| Público | Interesse |
|---|---|
| Recrutadores e avaliadores técnicos | Código, arquitetura, documentação e boas práticas IoT |
| Operadores e gestores das empresas monitoradas | Monitoramento de conformidade ambiental (perfis: administrador, operador, leitor) |
| Aluno e orientadores acadêmicos | Evolução e manutenção do projeto |

## 4. Escopo Funcional

**Incluído:**

- Autenticação de usuários com sessão;
- CRUD de empresas, unidades, setores, ambientes, usuários e dispositivos;
- Recebimento e exibição de telemetria MQTT em tempo real;
- Dashboard interativo com múltiplos ambientes de múltiplas empresas;
- Histórico de temperatura e umidade com filtros por período e ambiente;
- Gráficos de tendência;
- Indicador de status online/offline dos dispositivos.

**Fora de escopo:**

- Aplicativo nativo (Android/iOS);
- Controle de atuadores (relés, HVAC);
- Relatórios em PDF;
- Integração com ERPs;
- Faturamento e medição de consumo energético;
- PWA instalável com modo offline [A CONFIRMAR].

## 5. Requisitos Funcionais

| ID | Descrição | Prioridade | Critério de Aceitação | Dependências |
|---|---|---|---|---|
| RF001 | Autenticação de usuários (e-mail e senha) com logout | Must | Credenciais válidas acessam o painel; inválidas são rejeitadas; logout encerra a sessão | — |
| RF002 | CRUD de empresas (nome, CNPJ, status) | Must | Criar, listar, editar e desativar; nome obrigatório e único | — |
| RF003 | CRUD de unidades vinculadas a uma empresa | Must | Unidade só é criada vinculada a empresa existente | RF002 |
| RF004 | CRUD de setores vinculados a uma unidade | Must | Setor só é criado vinculado a unidade existente | RF003 |
| RF005 | CRUD de ambientes monitorados vinculados a um setor, com faixas ideais de temperatura e umidade | Must | Ambiente vinculado a setor existente; faixas ideais opcionais | RF004 |
| RF006 | CRUD de usuários vinculados a uma empresa, com perfil (administrador, operador, leitor) | Must | E-mail único; perfil obrigatório | RF002 |
| RF007 | Cadastro de dispositivos ESP32 vinculados a um ambiente (ID único, ex.: MAC/Client ID MQTT) | Must | Dispositivo vinculado a ambiente existente; ID único validado | RF005 |
| RF008 | Recebimento de telemetria via MQTT (temperatura °C, umidade %, timestamp) | Must | Leitura publicada no tópico correto é persistida no MySQL e exibida no dashboard | RF007 |
| RF009 | Dashboard em tempo real com leitura atual por ambiente | Must | Valores atualizados automaticamente, sem recarregar a página | RF008 |
| RF010 | Visualização de múltiplos ambientes de múltiplas empresas com navegação hierárquica | Must | Usuário visualiza apenas dados da sua empresa [A CONFIRMAR] | RF001, RF005 |
| RF011 | Histórico de temperatura e umidade com filtros por ambiente e período | Must | Consulta retorna todas as leituras do período, com paginação | RF008 |
| RF012 | Gráficos de tendência (linha) por ambiente | Should | Gráfico renderiza os dados do histórico selecionado | RF011 |
| RF013 | Alertas visuais quando leitura sai das faixas ideais | Should | Leitura fora da faixa é destacada e registrada como alerta | RF005, RF009 |
| RF014 | Indicador de status do dispositivo (online/offline) | Should | Dispositivo sem leitura por tempo configurável aparece como offline | RF007, RF008 |
| RF015 | Controle de perfis de acesso | Should | Ações restritas bloqueadas conforme perfil | RF001, RF006 |
| RF016 | Exportação do histórico em CSV | Could | CSV contém data/hora, temperatura e umidade | RF011 |
| RF017 | Modo demonstração público com dados simulados | Could | Visitante sem login visualiza painel de demonstração | RF009 |

## 6. Requisitos Não Funcionais

| ID | Categoria | Descrição | Verificação |
|---|---|---|---|
| RNF001 | Responsividade | Interface mobile-first, utilizável em smartphones, tablets e desktops | Sem rolagem horizontal em telas de 360 px |
| RNF002 | Desempenho | Leitura publicada no broker exibida em até 5 segundos | Cronometragem ponta a ponta |
| RNF003 | Segurança | MQTT com TLS em broker público; senhas com hash; credenciais fora do código | Inspeção do repositório e do tráfego |
| RNF004 | Compatibilidade | Funcionamento em Chrome, Firefox, Edge e Safari mobile | Teste manual nos quatro navegadores |
| RNF005 | Confiabilidade | QoS 1 na telemetria; falha de conexão exibe indicador de reconexão | Teste de interrupção de rede |
| RNF006 | Manutenibilidade | Código organizado, nomes claros, instalação documentada no README | Terceiro executa o projeto seguindo o README |
| RNF007 | Escalabilidade | Índices por ambiente e timestamp na tabela de telemetria | Consulta histórica < 3 s com 100.000 registros |
| RNF008 | Portabilidade | Executável em localhost e em hospedagem simples | Implantação seguida do README |

## 7. Regras de Negócio

| ID | Regra | Justificativa |
|---|---|---|
| RN001 | Todo usuário pertence a exatamente uma empresa e visualiza somente dados dela | Privacidade entre clientes (multi-empresa) |
| RN002 | Hierarquia obrigatória: ambiente ? setor ? unidade ? empresa | Rastreabilidade da telemetria |
| RN003 | Cada dispositivo ESP32 está vinculado a exatamente um ambiente por vez | Evitar ambiguidade das leituras |
| RN004 | Cadastros com histórico são desativados por exclusão lógica, nunca removidos | Integridade do histórico |
| RN005 | Leituras fora das faixas ideais geram registro de alerta | Rastreabilidade de inconformidades |
| RN006 | Intervalo de leitura configurável por dispositivo (padrão: 30 s) [A CONFIRMAR] | Equilíbrio entre granularidade e volume |
| RN007 | Apenas o perfil administrador gerencia cadastros | Governança dos dados |

## 8. Entidades Principais do Banco de Dados (MySQL)

- **empresa** (id PK, nome, cnpj, status, criado_em)
- **unidade** (id PK, empresa_id FK, nome, endereco, status)
- **setor** (id PK, unidade_id FK, nome, descricao)
- **ambiente** (id PK, setor_id FK, nome, descricao, temp_min_ideal, temp_max_ideal, umid_min_ideal, umid_max_ideal, status)
- **dispositivo** (id PK, ambiente_id FK, identificador_unico UNIQUE, descricao, intervalo_leitura_seg, status, ultima_leitura_em)
- **usuario** (id PK, empresa_id FK, nome, email UNIQUE, senha_hash, perfil ENUM('administrador','operador','leitor'), status)
- **leitura_telemetria** (id BIGINT PK, dispositivo_id FK, ambiente_id FK, temperatura_c DECIMAL(4,1), umidade_pct DECIMAL(4,1), lida_em DATETIME, INDEX(ambiente_id, lida_em))
- **alerta** (id BIGINT PK, ambiente_id FK, leitura_id FK, tipo ENUM('temperatura','umidade'), valor, limite_violado, ocorrido_em)

**Relacionamentos:**