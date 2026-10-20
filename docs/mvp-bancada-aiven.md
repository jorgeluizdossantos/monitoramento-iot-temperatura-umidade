# MVP de bancada com HiveMQ público e Aiven

Atualização: 19/10/2026. Complementa os planos existentes; não conclui a Fase 7 do
backend nem a Fase 6 do frontend.

## O que mudou em relação à página de teste

A página `monitor_engeasier-limite.html` conecta MQTT.js diretamente ao HiveMQ
público por WebSocket seguro. Exibe tópicos globais de temperatura, umidade,
porta, LED e limite, e publica comandos. Não faz persistência MySQL nem controle
de acesso por empresa. O firmware original fornecia valores individuais, sem
o contrato completo necessário para rastrear leituras no sistema.

O MVP reaproveita **o mesmo broker público**, mantendo as responsabilidades:

```text
ESP32 -- MQTT TCP/1883 --> HiveMQ público
                              |
                       WSS/8884 /mqtt
                              |
                    Node/Express local
                     |               |
                 MySQL TLS        REST + SSE
                     |               |
                   Aiven        React/Vite local
```

O navegador do projeto não recebe credenciais de banco/broker. O backend valida
identificador, payload e empresa, executa transações, persiste no Aiven e só então
avisa o frontend. Os tópicos individuais antigos permanecem para a página, mas
apenas `/dados` gera leituras. Porta gera evento quando muda. Controle atualiza
o estado confirmado do dispositivo, sem inventar uma leitura de temperatura.

## Preparação e inicialização

1. Mantenha `backend/.env` privado com `DB_AIVEN_HOST`, `PORT`, `NAME`, `USER`,
   `PASSWORD` sob o prefixo `DB_AIVEN_`, além de `DB_AIVEN_CA_FILE` apontando à CA.
   A validação TLS permanece habilitada.
2. Copie `backend/.env.mvp.example` para `backend/.env.mvp` **somente se ainda não
   existir**. O perfil local já foi preparado nesta bancada; não o sobrescreva.
3. Confira `DB_TARGET=aiven`, `MQTT_URL=wss://broker.hivemq.com:8884/mqtt`,
   `MQTT_TOPIC_PREFIX=stma` e `MQTT_DEVICE_IDS=esp32-a8032a1e7214`. Credenciais de
   broker e CA MQTT vazias são intencionais no perfil público de desenvolvimento.
4. Banco existente precisa da migração aditiva 002. Já aplicada no Aiven e no
   MySQL local desta bancada. Em outro ambiente, no diretório `backend`:

   ```powershell
   $env:STMA_ENV_FILE='.env.mvp'
   npm run migrate:control
   Remove-Item Env:STMA_ENV_FILE
   ```

   Use uma conta autorizada a ALTER para migrar. O comando reconhece as quatro
   colunas existentes; recusa estado parcial. Não recrie o schema nem importe seed
   sobre o banco em uso. Para banco vazio, `npm run migrate` aplica 001 e 002.
5. Em um terminal no diretório `backend`, execute `npm run dev:mvp`.
   O launcher carrega `.env` + `.env.mvp`; variáveis do processo prevalecem.
   Ele habilita `NODE_USE_SYSTEM_CA=1` para a cadeia WSS no Node 22.23 validado
   neste Windows, sem desabilitar verificação de certificados.
6. Em outro terminal no diretório `frontend`, execute `npm run dev`.
   Abra **http://127.0.0.1:5173**. A origem do perfil e o proxy Vite correspondem
   a esse endereço. Use a conta de administrador/operador/leitor da empresa.
7. Credenciais já criadas no Aiven estão somente no arquivo privado
   `backend/.local/acessos-mvp-aiven.txt`. Não entram no Git e não aparecem neste
   roteiro. A senha do superadmin Aiven não foi redefinida nesta adaptação.

Hierarquia autorizada: **Laboratório STMA → Bancada → Testes → Bancada ESP32**.
Dispositivo `esp32-a8032a1e7214`, sensor DHT11. Não foram inventadas faixas ideais:
o administrador deve configurá-las no cadastro do ambiente para gerar os alertas
de temperatura/umidade desejados. As rotinas usam uma conta MySQL de manutenção
separada e limitada; suas credenciais ficam em `.env.mvp`. O modelo distribuído
vem com `JOBS_ENABLED=false` até provisionar essa conta. Na bancada está habilitada.

## Onde consultar e operar

- **Painel:** temperatura, umidade, conexão e último estado da porta.
- **Detalhes do ambiente:** série, histórico/CSV, alertas e seção de LED/automático
  por dispositivo. O período deve incluir a data atual da medição.
- **Administrador e operador:** podem comandar LED e limite. **Leitor:** consulta.
  Superadmin administra empresas/dispositivos pendentes; para operar a bancada,
  use uma das contas vinculadas à empresa.
- A API responde 202 quando o broker aceita a publicação. A interface aguarda
  o UUID retornado em `/controle` antes de afirmar execução pelo ESP32. Timeout
  ou erro não significa que o dispositivo definitivamente não executou: confira
  o estado recebido antes de repetir.
- Sem estado recente (30 s), com manutenção, dispositivo inativo ou offline,
  comandos são bloqueados. O formulário também bloqueia comando manual enquanto
  o automático estiver ativo.

## Configuração, dados e manutenção

O schema continua com **13 tabelas e uma view**. `002_device_control.sql` adiciona
quatro colunas em `dispositivo`: LED, limite, instante de recebimento e UUID de
confirmação. O esquema original é preservado como migração 001. Auditoria grava
a solicitação de comando; não confundir essa intenção com execução física.

Firmware novo e instruções: `firmware/mqtt_esp32_limite_stma_v2/README.md`.
O intervalo de envio é configurável (15 s neste perfil de bancada). MySQL remoto
tem latência por consulta; o intervalo de 5 s causou acúmulo e reconexões durante
a validação. Não aumentar a frequência sem medir a capacidade da ingestão.

Deduplicação usa dispositivo + timestamp válido. Sem timestamp usa recebimento,
portanto não promete distinguir retransmissão de leitura igual. Leituras atrasadas
ficam no histórico sem alterar episódios atuais. Histórico/CSV seguem 31 dias;
série, 366 dias; rotinas de resumo/retenção seguem o plano existente.

## Pendências preservadas para pós-MVP

**A hospedagem contínua do backend ainda não foi resolvida.** Fechar o Node ou
desligar este computador interrompe ingestão, API, SSE e rotinas. Aiven hospeda
MySQL; HiveMQ hospeda o broker; nenhum deles executa nosso Express. Não há
recuperação garantida das amostras perdidas (firmware QoS 0, sem buffer local).

Broker público não autentica a origem de medições nem de comandos. Allowlist de
IDs reduz enganos, mas não impede falsificação. Backend usa WSS e banco usa TLS;
o trecho ESP32–broker desta versão usa TCP sem TLS. São limites explícitos do MVP.

Produção permanece pendente: escolher hospedagem gratuita viável para processo
Node persistente; broker privado e ACL; firmware TLS; configuração HTTPS/proxy,
cookie Secure e frontend Vercel; credencial restrita também para API no Aiven;
validação remota e aceite final. HiveMQ Lab/Cloud e EMQX continuam opções. No
backend, a troca ocorre por `MQTT_URL`, credenciais, CA, prefixo e allowlist; as
regras e os repositórios não dependem do fornecedor. Preserve os perfis anteriores.

### Evidências finais da bancada — 19/10/2026

O fluxo real pela interface passou: login com conta Aiven, painel/detalhe,
comando manual confirmado pelo UUID do ESP32, limite automático de 28 °C confirmado
e restauração do estado anterior. Conferência posterior no Aiven: dispositivo
online, 86 leituras acumuladas, um evento de porta, LED apagado e automático
inativo. Essa contagem é uma fotografia da validação; continua crescendo enquanto
a bancada e o backend estiverem ligados.

O intervalo de 15 s estabilizou a conexão observada; o prazo de espera pelo PUBACK
foi ajustado para 10 s, acomodando a ingestão transacional na mesma conexão MQTT.
Isso não oferece SLA de produção. Históricos, controles e regras de permissão
continuam limitados pelos contratos descritos neste guia.

Regressão conjunta do backend: 56 testes unitários e 56 de integração MySQL
aprovados após os ajustes; MQTT tinha nove cenários aprovados e recebeu um cenário
adicional de publicação/retorno de controle. Frontend: 27 testes unitários e 39
cenários Edge aprovados; acrescentado teste do primeiro ponto no gráfico.
Resultados finais desses acréscimos e CI ficam nos roteiros.

Validação final da versão `d30cba1`: CI backend 39355577458 aprovado com 122 testes;
CI frontend 39355577471 aprovado com 27 unitários e 40 testes de navegador. O ponto
isolado do gráfico e o retorno do comando MQTT estão cobertos. O benchmark local
continuou intermitente; no CI isolado, páginas inicial/final em 30/35 ms, sem relaxar
limites. Consulte os roteiros para o histórico completo das tentativas.
