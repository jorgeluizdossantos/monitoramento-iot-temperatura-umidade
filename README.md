# Monitoramento remoto de temperatura e umidade

Projeto de portfólio para aluno de Desenvolvimento de Sistemas do SENAI,
direcionado a estágio em projetos elétricos e automação industrial.

**Etapa atual: Fase 0 — setup.** Esta entrega prepara a infraestrutura.
A API, o firmware e as telas serão implementados nas fases correspondentes.
O repositório já está publicado no GitHub. O encerramento da fase depende
da configuração e validação de um broker MQTT compatível.

## Arquitetura prevista

ESP32 + DHT22 → MQTT com TLS → backend Node.js/Express → MySQL 8.
O frontend HTML/JavaScript/Tailwind consumirá a API REST e MQTT via WSS.
A sequência segue o plano de implementação: contratos antes de consumidores.
O broker é intercambiável por configuração: Mosquitto, EMQX Cloud e HiveMQ
permanecem opções. Veja a [decisão de arquitetura e comparação](docs/arquitetura-brokers.md).

```text
backend/   Dependências; API e serviços na Fase 1 em diante
docs/      Diretrizes, decisões e registro da execução
firmware/  Reservado para a Fase 3
frontend/  Reservado para a Fase 4
scripts/   Schema, seed e verificações da infraestrutura
```

## Executar a Fase 0

Pré-requisitos: Node.js 22 (ambiente utilizado; documentos admitem 18+), npm,
Git e Docker Desktop em modo Linux para MySQL 8. Um MySQL 8 nativo também
pode ser usado, com banco vazio `monitoramento_iot` e usuário próprio.

Na raiz deste projeto, em PowerShell:

```powershell
# Faça a cópia apenas se ainda não existir um .env local.
Copy-Item .env.example .env
# Edite .env e preencha MYSQL_ROOT_PASSWORD e DB_PASSWORD com senhas próprias.
npm --prefix backend ci
docker compose up -d --wait
npm --prefix backend run db:setup
npm --prefix backend run check:db
```

O MySQL é exposto somente em `127.0.0.1:13306`, com volume persistente.
Nesta máquina, o npm precisou usar a cadeia de certificados confiáveis do
Windows. Se ocorrer `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, com Node 22.23.3 use
`$env:NODE_OPTIONS='--use-system-ca'` antes de `npm --prefix backend ci`.
Não desative a verificação de certificados.

`db:setup` recusa bancos com tabelas para proteger dados existentes. O DDL do
MySQL não é transacional: em caso de falha parcial do schema, inspecione o
banco antes de uma nova tentativa; o script nunca apaga tabelas automaticamente.
O seed é inserido em transação. `check:db` destina-se ao banco com seed inicial,
confere quantidades exatas e desfaz suas alterações de verificação.

Os dados fictícios incluem duas empresas, três unidades, quatro setores,
quatro ambientes, quatro dispositivos, quatro usuários, nove leituras e dois
alertas. Os usuários abaixo usam a senha pública **demo123**, com hashes bcrypt
reais e distintos no seed, exclusivamente para desenvolvimento:

| E-mail | Perfil |
|---|---|
| admin@horizonte.com.br | administrador |
| operador@horizonte.com.br | operador |
| leitor@horizonte.com.br | leitor |
| admin@valefrio.com.br | administrador |

Ainda não há login HTTP nesta fase. Antes de exposição pública, substitua os
usuários de demonstração e suas senhas. Datas de telemetria são UTC.

## Validar o broker MQTT selecionado

Provisione o serviço escolhido e suas credenciais MQTT. Preencha no `.env`
local `MQTT_TLS_URL`, `MQTT_WSS_URL`, `MQTT_USERNAME` e `MQTT_PASSWORD`.
Use os endpoints reais: por exemplo, EMQX Serverless usa TLS 8883 e WSS 8084.
Hosts e caminho WSS podem ser distintos. A configuração original com
`MQTT_HOST` e portas continua aceita quando as duas URLs estiverem vazias.

Para guardar alternativas, use `.env.emqx.local`, `.env.mosquitto.local` ou
`.env.hivemq.local` e selecione com `$env:MQTT_PROFILE='emqx'` no PowerShell.
O perfil padrão lê `.env`. Arquivos de outros perfis não são mesclados.
Variáveis MQTT do processo prevalecem; remova overrides antigos ao trocar.
O comando seleciona a configuração do teste; não provisiona o broker.
Consulte [exemplos e procedimento de troca](docs/arquitetura-brokers.md).

```powershell
npm --prefix backend run check:mqtt
```

O script exige certificado válido e confirma autenticação seguida de PINGRESP
em ambos os transportes. Não publica telemetria nem inicia ingestão.
O teste de autenticação não valida permissões de tópicos; ACLs serão
homologadas antes de conectar dispositivos e consumidores nas fases seguintes.
Credenciais administrativas ou do backend nunca devem ir para o navegador.

Execute `npm --prefix backend run test:mqtt-config` para validar o contrato de
configuração sem conexão externa. Para brokers próprios, configure TLS/WSS e
ACLs antes do smoke test. O HiveMQ Cloud Serverless deixou de aceitar novos
clusters em 30/09/2026; HiveMQ Lab local e Cloud Starter seguem como opções
com condições diferentes, detalhadas na decisão de arquitetura.

## Versionamento e continuidade

Para publicar também na conta wxlv7h, siga o
[roteiro de convite e colaboração no GitHub](docs/tutorial-colaborador-github.md).
O segundo repositório depende de convite aceito e URL confirmada.

Repositório público: [monitoramento-iot-temperatura-umidade](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade).
Use Conventional Commits e mantenha `.env`,
`config.h`, certificados e dependências fora do Git.

Fases: **0 setup** → 1 backend → 2 ingestão/alertas → 3 firmware → 4 frontend
→ 5 integração → 6 qualidade/deploy/portfólio. Consulte
o [plano de implementação atualizado](docs/plano-de-implementacao.md), com
status por tarefa, pendências e próximos passos, e o
[controle da Fase 0](docs/fase-0.md) antes de iniciar a próxima etapa.

Para parar o MySQL preservando os dados: `docker compose stop`.
Licença: [MIT](LICENSE).
