# Casos de Teste — Sistema Web de Monitoramento IoT de Temperatura e Umidade

> Projeto de Portfólio — Monitoramento IoT com ESP32 e MQTT
> Versão 1.0 — 04/10/2026
> Documento complementar ao Plano de Testes v1.0 (matriz RF/RNF ? CT)

**Dados de referência (seed.sql):** 2 empresas (Horizonte, Vale Frio); 4 ambientes com faixas ideais (Quadro Geral BT 15–35 °C / 30–70 %; Estoque Eletrônica 18–25 °C / 45–55 %; Câmara Fria -2–4 °C / 70–95 %); dispositivos ESP32-A1B2C3 etc.; usuários admin@horizonte.com.br (administrador), operador@horizonte.com.br (operador), leitor@horizonte.com.br (leitor).

---

## Bloco 1 — Autenticação e Sessão (RF001)

### CT001 — Login com credenciais válidas
- **Requisito:** RF001 | **Prioridade:** Must
- **Pré-condições:** seed carregado; backend na porta 3000.
- **Passos:** 1) Abrir `frontend/index.html`; 2) Informar `admin@horizonte.com.br` e senha correta; 3) Submeter.
- **Esperado:** HTTP 200; JWT em sessionStorage; redirecionamento ao dashboard; nome e perfil exibidos no cabeçalho.

### CT002 — Login com senha inválida
- **Requisito:** RF001 | **Prioridade:** Must
- **Passos:** 1) Informar `admin@horizonte.com.br` com senha incorreta; 2) Submeter.
- **Esperado:** HTTP 401; mensagem "Credenciais inválidas"; sem token armazenado.

### CT003 — Acesso a rota protegida sem sessão
- **Requisito:** RF001 | **Prioridade:** Must
- **Passos:** 1) Abrir `frontend/dashboard.html` diretamente sem login.
- **Esperado:** `auth.js` redireciona imediatamente ao login.

### CT004 — Logout
- **Requisito:** RF001 | **Prioridade:** Must
- **Passos:** 1) Clicar em "Sair"; 2) Usar botão "Voltar" do navegador.
- **Esperado:** sessionStorage limpo; retorno ao login; histórico não reabre o painel.

## Bloco 2 — Cadastros e Hierarquia (RF002–RF007)

### CT005 — Criar empresa
- **Requisito:** RF002 | **Prioridade:** Must
- **Pré-condições:** perfil administrador autenticado.
- **Passos:** 1) Em `cadastros.html`, criar empresa com nome e CNPJ válidos; 2) Submeter.
- **Esperado:** HTTP 201; empresa listada com status = 1.

### CT006 — Duplicar empresa
- **Requisito:** RF002 | **Prioridade:** Must
- **Passos:** 1) Cadastrar empresa com nome já existente.
- **Esperado:** HTTP 400 com mensagem de unicidade; banco inalterado.

### CT007 — Criar unidade vinculada a empresa existente
- **Requisito:** RF003 | **Prioridade:** Must
- **Esperado:** HTTP 201; unidade aparece na hierarquia da empresa.

### CT008 — Criar unidade com empresa inexistente (empresa_id = 9999)
- **Requisito:** RF003 | **Prioridade:** Must
- **Esperado:** HTTP 400; nenhum registro inserido.

### CT009 — Criar setor vinculado a unidade existente
- **Requisito:** RF004 | **Prioridade:** Must
- **Esperado:** HTTP 201.

### CT010 — Criar setor com unidade inexistente (unidade_id = 8888)
- **Requisito:** RF004 | **Prioridade:** Must
- **Esperado:** HTTP 400 (RN002).

### CT011 — Criar ambiente com faixas ideais válidas (18–25 °C / 45–55 %)
- **Requisito:** RF005 | **Prioridade:** Must
- **Esperado:** HTTP 201; faixas persistidas.

### CT012 — Criar ambiente com faixa inválida (mín > máx)
- **Requisito:** RF005 | **Prioridade:** Must
- **Esperado:** HTTP 400; bloqueio pela constraint CHECK.

### CT013 — Criar usuário com e-mail único e perfil definido
- **Requisito:** RF006 | **Prioridade:** Must
- **Passos:** 1) Criar usuário; 2) Consultar `SELECT senha_hash FROM usuario`.
- **Esperado:** HTTP 201; senha armazenada apenas como hash bcrypt ($2a$10$...).

### CT014 — Criar usuário com e-mail duplicado
- **Requisito:** RF006 | **Prioridade:** Must
- **Esperado:** HTTP 400; índice único `uk_usuario_email` ativo.

### CT015 — Cadastrar dispositivo com identificador único vinculado a ambiente
- **Requisito:** RF007 | **Prioridade:** Must
- **Esperado:** HTTP 201; status "ativo".

### CT016 — Cadastrar dispositivo com identificador duplicado
- **Requisito:** RF007 | **Prioridade:** Must
- **Esperado:** HTTP 400; unicidade `uk_dispositivo_identificador` preservada.

### CT016A — Desativar cadastro com histórico (exclusão lógica)
- **Requisito:** RF002, RN004 | **Prioridade:** Must
- **Passos:** 1) Desativar ambiente que possui leituras; 2) Inspecionar banco.
- **Esperado:** status = 0 (inativo); histórico preservado; sem erro de chave estrangeira.

## Bloco 3 — Ingestão MQTT (RF008)

### CT017 — Publicar payload válido
- **Requisito:** RF008 | **Prioridade:** Must
- **Passos:** 1) Via mosquitto_pub/MQTT Explorer, publicar no tópico `empresa/1/unidade/1/ambiente/1/telemetria`: `{"dispositivo":"ESP32-A1B2C3","temperatura":24.6,"umidade":58.2,"timestamp":"2026-10-04T14:32:00Z"}`; 2) Inspecionar banco.
- **Esperado:** linha em leitura_telemetria; ultima_leitura_em atualizada.

### CT018 — Publicar JSON malformado (string truncada)
- **Requisito:** RF008 | **Prioridade:** Must
- **Esperado:** rejeição com log de erro; serviço permanece ativo; nenhuma linha criada.

### CT019 — Publicar payload com campo ausente (sem umidade)
- **Requisito:** RF008 | **Prioridade:** Must
- **Esperado:** rejeição registrada; nenhuma linha criada.

### CT020 — Publicar valor fisicamente impossível (umidade 150 %)
- **Requisito:** RF008 | **Prioridade:** Must
- **Esperado:** rejeição; nenhuma linha criada.

### CT020B — Mensagem duplicada (QoS 1)
- **Requisito:** RF008, RNF005 | **Prioridade:** Must
- **Passos:** 1) Publicar mesma mensagem (dispositivo + timestamp) duas vezes em 1 s; 2) Contar registros.
- **Esperado:** idempotência — nenhuma leitura duplicada no banco.

## Bloco 4 — Dashboard em Tempo Real (RF009, RF010)

### CT021 — Atualização em tempo real
- **Requisito:** RF009 | **Prioridade:** Must
- **Passos:** 1) Com dashboard aberto, publicar nova leitura.
- **Esperado:** cartão atualiza temperatura/umidade/hora sem recarregar a página.

### CT022 — Múltiplos ambientes
- **Requisito:** RF009 | **Prioridade:** Must
- **Passos:** 1) Publicar leituras em tópicos de ambientes diferentes.
- **Esperado:** cada cartão atualiza apenas o seu ambiente.

### CT023 — Isolamento por empresa
- **Requisito:** RF010, RN001 | **Prioridade:** Must
- **Passos:** 1) Logar como usuário da Horizonte; 2) Verificar lista de ambientes.
- **Esperado:** apenas ambientes da Horizonte visíveis; nada do Vale Frio aparece.

## Bloco 5 — Histórico e Gráficos (RF011, RF012)

### CT024 — Consultar histórico com filtros (ambiente 1, 24 h)
- **Requisito:** RF011 | **Prioridade:** Must
- **Esperado:** tabela lista todas as leituras do período ordenadas por hora.

### CT025 — Consultar período sem dados
- **Requisito:** RF011 | **Prioridade:** Must
- **Esperado:** lista vazia com mensagem amigável, sem erro no console.

### CT026 — Paginação com mais de 50 registros
- **Requisito:** RF011 | **Prioridade:** Must
- **Esperado:** 50 registros por página e controles de navegação.

### CT027 — Gráfico de tendência
- **Requisito:** RF012 | **Prioridade:** Should
- **Esperado:** gráfico de linha renderiza séries de temperatura e umidade do período.

## Bloco 6 — Alertas (RF013)

### CT028 — Leitura fora da faixa
- **Requisito:** RF013, RN005 | **Prioridade:** Should
- **Passos:** 1) Publicar `{"temperatura":26.2}` no ambiente Estoque Eletrônica (máx 25,0).
- **Esperado:** registro em alerta; cartão do dashboard fica vermelho.

### CT029 — Leitura de volta à faixa
- **Requisito:** RF013 | **Prioridade:** Should
- **Passos:** 1) Publicar leitura normal após o alerta.
- **Esperado:** cartão retorna ao verde; nenhum novo alerta gerado.

## Bloco 7 — Status do Dispositivo / LWT (RF014)

### CT030 — Detecção de queda
- **Requisito:** RF014 | **Prioridade:** Should
- **Passos:** 1) Desenergizar o ESP32 (ou encerrar o simulador abruptamente); 2) Verificar tópico `dispositivo/{id}/status` no MQTT Explorer.
- **Esperado:** broker publica `{"status":"offline"}` retido; status offline no dashboard e no banco.

### CT031 — Retorno online
- **Requisito:** RF014 | **Prioridade:** Should
- **Passos:** 1) Religar o ESP32.
- **Esperado:** `{"status":"online"}` retido; status volta a online; telemetria retoma.

## Bloco 8 — Perfis de Acesso (RF015)

### CT032 — Leitor tentando criar cadastro
- **Requisito:** RF015, RN007 | **Prioridade:** Should
- **Passos:** 1) Logar como leitor; 2) Tentar POST /api/empresas.
- **Esperado:** HTTP 403; botões de criação ocultos na interface.

### CT033 — Operador tentando excluir cadastro
- **Requisito:** RF015 | **Prioridade:** Should
- **Esperado:** HTTP 403.

### CT034 — Administrador executa CRUD completo
- **Requisito:** RF015 | **Prioridade:** Should
- **Esperado:** todas as operações permitidas (HTTP 200/201).

## Bloco 9 — Exportação e Modo Demo (RF016, RF017)

### CT035 — Exportar histórico em CSV
- **Requisito:** RF016 | **Prioridade:** Could
- **Esperado:** arquivo CSV com colunas data/hora, temperatura, umidade e dados corretos.

### CT036 — Modo demonstração sem login
- **Requisito:** RF017 | **Prioridade:** Could
- **Esperado:** dashboard com dados fictícios visível, sem acesso a dados reais.

## Bloco 10 — Requisitos Não Funcionais (RNF001–RNF008)

### CT037 — Responsividade mobile (360 px)
- **Requisito:** RNF001 | **Prioridade:** Must
- **Passos:** 1) Abrir dashboard em viewport de 360 px (DevTools ou smartphone).
- **Esperado:** sem rolagem horizontal; cartões empilhados; menu funcional.

### CT038 — Responsividade tablet/desktop
- **Requisito:** RNF001 | **Prioridade:** Must
- **Esperado:** 768 px = 2 colunas; =1024 px = 3+ colunas com menu lateral fixo.

### CT039 — Latência ponta a ponta
- **Requisito:** RNF002 | **Prioridade:** Must
- **Passos:** 1) Cronometrar da publicação no broker até a atualização no dashboard, 5 medições.
- **Esperado:** média = 5 s em todas as medições.

### CT040 — Senhas com hash
- **Requisito:** RNF003 | **Prioridade:** Must
- **Passos:** 1) Inspecionar tabela usuario.
- **Esperado:** nenhum valor de senha em texto puro; apenas hash bcrypt.

### CT041 — Credenciais fora do Git
- **Requisito:** RNF003 | **Prioridade:** Must
- **Passos:** 1) Revisar repositório e histórico de commits.
- **Esperado:** nenhum .env, config.h ou chave versionada; apenas arquivos .example.

### CT042 — Compatibilidade de navegadores
- **Requisito:** RNF004 | **Prioridade:** Must
- **Passos:** 1) Executar fluxo principal em Chrome, Firefox, Edge e Safari Mobile.
- **Esperado:** funcionamento e leiaute consistentes nos quatro.

### CT043 — Reconexão do frontend
- **Requisito:** RNF005 | **Prioridade:** Must
- **Passos:** 1) Derrubar rede do navegador por 15 s; 2) Restabelecer.
- **Esperado:** indicador de desconexão exibido; reconexão automática sem recarga; dados preservados.

### CT044 — Reconexão do firmware
- **Requisito:** RNF005 | **Prioridade:** Must
- **Passos:** 1) Desligar/ligar o roteador Wi-Fi.
- **Esperado:** ESP32 reconecta automaticamente e retoma publicações.

### CT045 — Execução por terceiro via README
- **Requisito:** RNF006 | **Prioridade:** Should
- **Esperado:** sistema operacional seguindo apenas o README, sem ajuda adicional.

### CT046 — Desempenho do histórico (100.000 registros)
- **Requisito:** RNF007 | **Prioridade:** Should
- **Passos:** 1) Popular leitura_telemetria com 100.000 registros via script; 2) Consultar 30 dias.
- **Esperado:** resposta em menos de 3 s (índice composto idx_amb_tempo).

### CT047 — Portabilidade
- **Requisito:** RNF008 | **Prioridade:** Should
- **Esperado:** funcionamento equivalente em localhost e em hospedagem em nuvem.

---

## Registro de Execução

| ID do Caso | Data | Executor | Resultado (Aprovado/Reprovado/Bloqueado) | Issue associada | Observações |
|---|---|---|---|---|---|
| CT001 | | | | | |
| CT002 | | | | | |
| ... | | | | | |
| CT047 | | | | | |

## Controle de Versão

| Versão | Data | Autor | Descrição |
|---|---|---|---|
| 1.0 | 04/10/2026 | Aluno (Redator de Requisitos/QA) | Emissão inicial — 47 casos de teste |