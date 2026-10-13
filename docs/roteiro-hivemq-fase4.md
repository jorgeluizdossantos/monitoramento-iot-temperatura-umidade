# Roteiro HiveMQ — Fase 4 do STMA

Atualizado em 12/10/2026. Objetivo: conectar o ESP32 e o backend ao mesmo broker, mantendo fornecedor e banco selecionáveis por configuração.

## 1. O que já sabemos do equipamento

O proprietário informou `broker.hivemq.com`; o código apresentado usa porta 1883, WiFiClient e PubSubClient. Trata-se do broker público compartilhado, separado do broker da conta HiveMQ Platform. Ele serve a testes temporários e não deve receber dados privados ou de produção. [Fonte oficial](https://www.hivemq.com/mqtt/public-mqtt-broker/).

A mensagem observada no MQTTBox já atende ao contrato de dados:

```text
engeasier/esp32-a8032a1e7214/dados
```

```json
{"id":"esp32-a8032a1e7214","temperatura":28.9,"umidade":61.0}
```

Sem timestamp, o backend usa recebimento. A publicação observada é QoS 0 e não retida: permite demonstrar ingestão, mas não garantir reentrega nem deduplicação de retransmissões. O backend também aceita `Porta Aberta` e `Porta Fechada` no tópico identificado `/porta`.

Os tópicos genéricos `engeasier/temperatura` e `engeasier/umidade` não identificam um dispositivo e não são consumidos. O array de temperaturas retido nesses tópicos não comprova origem no ESP32 do projeto; o broker é compartilhado. Não inferimos qual é a última medição nem associamos esses dados a uma empresa.

O código colado no chat não gera o JSON identificado acima: ele publica tópicos genéricos. É necessário localizar o arquivo .ino efetivamente gravado na placa antes de alterá-lo. Comandos de LED não fazem parte da ingestão STMA e não serão enviados automaticamente.

## 2. Encontrar a página e identificar a modalidade

1. Abra a página HiveMQ onde aparecem os quatro passos.
2. Pressione Ctrl+L para selecionar o endereço da barra do navegador e Ctrl+C para copiá-lo. Esse endereço é a URL da página; não é necessariamente o endereço MQTT.
3. Ao compartilhar o endereço, remova parâmetros após `?` e qualquer token.
4. Clique em **Connect** e selecione o broker listado.
5. Informe o tipo exibido: **Software/Lab**, **Cloud/Starter** ou **Serverless**. Informe também o host e a porta da conexão MQTT, se exibidos. Não copie senha nem licença.

Os quatro itens informados pelo proprietário são os do HiveMQ Platform. Isso identifica a interface, mas não confirma por si só a modalidade do broker. A documentação usa Software/Docker com licença Lab no tutorial. [Guia oficial](https://docs.hivemq.com/hivemq-platform/get-started-with-hivemq.html).

## 3. O próximo passo no HiveMQ Platform

Com o broker conectado, abra **Start streaming data** ou **Next, get data flowing**. A opção **Use simulated data** demonstra a plataforma; a opção de conectar seus próprios dispositivos é a pertinente ao ESP32. Se escolher simulação, o comando fornecido deve apontar ao broker que está rodando e a indicação esperada é **Data is flowing!**.

A simulação comprova o fluxo da plataforma, mas não substitui o contrato STMA nem testa a persistência no MySQL. Para concluir nosso fluxo, o ESP32 deve publicar no mesmo broker que o backend. Namespace e agente são recursos adicionais da plataforma e não são necessários à aplicação desta fase. Não é preciso completar esses itens para o assinante MQTT gravar no banco.

## 4. Se o broker for Software/Docker/Lab

O broker roda na máquina/servidor onde o Docker foi iniciado. Estar conectado ao HiveMQ Platform não transforma automaticamente esse contêiner em um serviço MQTT hospedado na nuvem.

1. Confira no Docker Desktop se o contêiner HiveMQ está em execução e qual porta está publicada. A tela 8080 é o Control Center; MQTT normalmente usa a porta publicada para 1883.
2. Backend na mesma máquina pode usar `mqtt://127.0.0.1:PORTA_PUBLICADA` em desenvolvimento.
3. O ESP32 precisa alcançar o IP da máquina na rede local, não `127.0.0.1`. Confirmaremos IP, rede e configuração do contêiner antes de mudar o firmware.
4. Em uma implantação remota, configure listener TLS e autenticação. O backend atual recusa conexão remota em texto puro.
5. Preserve sua licença apenas no ambiente local. Não a inclua em arquivos versionados ou mensagens.

No PowerShell, a barra invertida `\` não continua comandos como no Bash. Execute o comando Docker em uma linha ou use a crase do PowerShell no final da linha, sem espaços depois dela. Não execute novamente um comando de criação antes de conferir se o contêiner já existe.

## 5. Se o broker for Cloud

1. Abra o broker em **Connect**, ou **Cloud Clusters → Manage Cluster** na interface antiga.
2. Localize os detalhes da conexão e anote hostname e porta MQTT TLS.
3. Em gerenciamento de acesso, crie uma credencial para o backend assinar `engeasier/+/dados`, `engeasier/+/status` e `engeasier/+/porta`, conforme as permissões disponíveis no plano.
4. Crie uma credencial de publicação para o ESP32, restrita aos seus tópicos quando o plano permitir. Senha de login da conta e senha MQTT são coisas diferentes.
5. Preencha as credenciais somente no arquivo `.env` local e no arquivo privado de configuração do firmware. Não envie senhas no chat.
6. Firmware Cloud precisa de conexão TLS e validação de certificado; trocar apenas a porta no WiFiClient atual não é suficiente.

Não conte com a criação de um novo Serverless gratuito: ela foi encerrada; clusters existentes serão desativados em 31/12/2026. Confirme a modalidade e sua duração antes de escolher o destino. Não foi contratado nenhum plano para este projeto. [Aviso oficial Serverless](https://docs.hivemq.com/hivemq-cloud/serverless-end-of-life.html).

## 6. Configuração e validação do backend

Após identificar o destino, preencha os valores reais em `backend/.env`:

```dotenv
MQTT_ENABLED=true
MQTT_URL=mqtts://HOST_DO_BROKER:PORTA_TLS
MQTT_CLIENT_ID=stma-backend-jorge
MQTT_TOPIC_PREFIX=engeasier
MQTT_USERNAME=USUARIO_MQTT_BACKEND
MQTT_PASSWORD=SENHA_SOMENTE_NO_ARQUIVO_LOCAL
MQTT_CA_FILE=
DB_TARGET=local
```

O bloco é um modelo, não uma configuração pronta. CA vazia usa as autoridades confiáveis do Node; para CA privada, informe o caminho do certificado. Para broker Docker na mesma máquina, use o endereço loopback descrito acima. Não configure `broker.hivemq.com:1883` no backend: o transporte remoto sem TLS é recusado pela configuração atual.

Na raiz do projeto:

```powershell
npm --prefix backend run mqtt:check
npm --prefix backend run dev
```

O diagnóstico não grava dados e não reutiliza o client ID da ingestão. Confirme o log `mqtt_subscribed`. Ligue o ESP32 e observe os tópicos identificados no MQTTBox conectado ao mesmo broker. Se o dispositivo ainda não estiver cadastrado, a mensagem aparecerá na fila de pendentes, não no histórico.

Entre como superadmin, selecione o ambiente previamente cadastrado e adote o dispositivo com sensor DHT11. Nome de empresa/unidade/setor/ambiente e destino local ou Aiven precisam ser definidos pelo proprietário; não criaremos cadastros reais arbitrários. As próximas publicações devem gerar histórico e atualizar a última leitura. A fila não retroimporta o último payload.

## 7. Critérios de encerramento

- [x] Fluxo com dois brokers de teste e MySQL local automatizado.
- [x] Payload identificado fornecido pelo proprietário analisado; porta textual compatível.
- [x] Modalidade Software/Lab e endpoint local confirmados; diagnóstico MQTT aprovado.
- [x] Arquivo do firmware em uso localizado e cópia configurável preparada.
- [ ] ESP32 e backend conectados ao mesmo destino.
- [ ] Credenciais/TLS validados quando aplicáveis; destino do banco confirmado.
- [ ] Dispositivo adotado no ambiente escolhido e leitura física persistida.
- [ ] Aceite e tag da Fase 4; somente depois, Fase 5.

### Atualização: broker Lab identificado e conexão validada

O proprietário confirmou HiveMQ Software, nome Lively Honey, pacote Lab. Foi encontrado o contêiner local hivemq em execução, publicando MQTT em 1883 e Control Center em 8080. O diagnóstico mqtt:check, com MQTT_URL=mqtt://127.0.0.1:1883 somente no ambiente do comando, conectou e obteve as três assinaturas QoS 1. TLS não foi usado porque a conexão foi loopback local. O arquivo .env não foi alterado e o diagnóstico não gravou telemetria.

A modalidade e o endpoint local estão confirmados. Ainda falta localizar o .ino efetivamente em uso, apontar ESP32 e backend ao mesmo broker e validar a leitura física no banco/ambiente escolhido. O ESP32 deve usar o IPv4 da máquina na mesma rede, porta 1883; localhost na placa apontaria para a própria placa. O computador e o Docker precisam permanecer ligados. Não foi criado serviço Cloud nem contratado plano.

### Firmware localizado e cópia preparada

O sketch atual mqtt_esp32_aula_pub foi lido no caminho indicado pelo proprietário. Ele gera o ID a partir do MAC e publica o JSON esperado em /dados; o comando de LED usa /comando. Foi criada a cópia firmware/mqtt_esp32_stma, preservando pinos, mensagens e comportamento. Wi-Fi e host/porta foram separados em config.h ignorado pelo Git, com modelo público config.example.h. Host local observado: 192.168.0.102:1883 para a placa; backend no mesmo PC usa 127.0.0.1:1883.

O original foi preservado. Sem compilador arduino-cli disponível no PATH, não foi confirmada compilação desta cópia. Faltam selecionar placa/COM, verificar e carregar pela Arduino IDE, conferir mensagens no HiveMQ local e validar adoção/persistência no banco escolhido. Fase 4 continua aberta. Instruções em firmware/mqtt_esp32_stma/README.md.

### Compilação física — ESP32 Dev Module / COM13

O proprietário confirmou ESP32 Dev Module, COM13, USB e mesma rede Wi-Fi. Autorizou MySQL local e hierarquia Laboratório STMA → Bancada → Testes → Bancada ESP32, com DHT11.

Foi localizado o arduino-cli incluído na Arduino IDE. A compilação com esp32:esp32:esp32 e as bibliotecas Arduino locais foi aprovada: 902380 bytes de programa (68%) e 47328 bytes de RAM (14%). A tentativa de upload falhou ao abrir COM13, com acesso negado/porta ocupada ou indisponível; não houve confirmação de gravação. Solicitado fechar Monitor Serial/Plotter e outros clientes seriais antes de tentar novamente.

Próximo passo: liberar COM13, repetir upload e validar mensagens reais no HiveMQ local; somente depois provisionar a hierarquia autorizada e confirmar a persistência. Nenhum cadastro demonstrativo ou leitura física foi criado nesta tentativa. Fase 4 permanece aberta.
