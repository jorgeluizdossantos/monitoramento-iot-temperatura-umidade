# Regras de negócio do STMA — referência consolidada

Revisão: 14/10/2026. Backend Node.js/Express/TypeScript com MySQL e sem ORM.

Este documento reúne as regras implementadas nas Fases 1–6 e as regras da demonstração em implementação na Fase 7. Diferencia comportamento existente de pendências. O plano e o roteiro registram execução e evidências; este documento explica o comportamento esperado da aplicação.

## 1. Onde as regras estão no código

As regras **não estão concentradas em um único arquivo de código**. Estão agrupadas por assunto. Isso permite testar os módulos e substituir o adaptador mysql2 por Prisma posteriormente.

| Assunto | Arquivos principais em backend/src | Responsabilidade |
|---|---|---|
| Identidade e sessão | modules/auth/auth.service.ts, auth.scope.ts, auth.middleware.ts | Login, sessão válida, escopo e perfil |
| Cadastros | modules/cadastros/cadastro.service.ts e cadastro.validation.ts | Autorização, hierarquia, faixas, último administrador, auditoria |
| Telemetria | modules/telemetria/telemetry.service.ts | Contrato MQTT, identidade e normalização |
| Persistência da ingestão | modules/telemetria/mysql-telemetry.repository.ts | Atomicidade, deduplicação, ordenação e vínculo histórico |
| Política de alertas | modules/telemetria/alert-policy.ts | Funções puras: violação, severidade e extremo |
| Episódios | modules/telemetria/mysql-alert-episodes.ts | Abrir, atualizar e encerrar episódios na transação |
| Pendências | modules/telemetria/pending.service.ts e mysql-pending.repository.ts | Adoção exclusiva por superadmin |
| Histórico e CSV | modules/telemetria/history.service.ts | Duração, paginação e horas completas |
| Painel e reconhecimento | modules/telemetria/monitoring.service.ts e mysql-monitoring.repository.ts | Escopo e reconhecimento idempotente |
| Manutenção | modules/maintenance/maintenance.service.ts | Janelas de resumo e retenção |
| Persistência da manutenção | modules/maintenance/mysql-maintenance.repository.ts | Offline, lotes, locks e preservação dos resumos |
| Demonstração (Fase 7) | modules/demo/demo.service.ts e mysql-demo.repository.ts | Consulta pública limitada a empresas demonstrativas |
| Garantias do banco | migrations/001_stma_schema.sql | CHECK, FKs compostas, unicidade e view do painel |

Há regras que ainda são expressas dentro dos adaptadores SQL: concorrência, proteção do vínculo histórico, deduplicação, reconhecimento e persistência dos episódios. A classificação do painel está na view `vw_ambiente_estado`. Portanto, uma migração futura de ORM **não pode substituir somente as consultas sem preservar essas regras e seus testes**. Não foi feita uma refatoração arquitetural ampla apenas para reunir regras em um arquivo artificial.

Os arquivos `config/*`, `db/mysql.ts`, rotas HTTP, consumidor MQTT, scheduler e Dockerfile cuidam principalmente de configuração, transporte, segurança técnica e operação. Eles não devem ser usados para espalhar novas decisões de domínio.

## 2. Regras originais RN001–RN007 e decisões aprovadas

| Regra | Comportamento vigente |
|---|---|
| RN001 — empresa e privacidade | Usuário comum pertence a uma empresa. O escopo vem da sessão validada, nunca de um empresa_id enviado pelo cliente. Superadmin tem empresa_id nulo e administra a plataforma, sem acesso implícito aos painéis das empresas. |
| RN002 — hierarquia | Empresa → unidade → setor → ambiente. Os vínculos precisam pertencer à mesma empresa. A aplicação valida os ancestrais e o MySQL reforça a regra com FKs compostas. |
| RN003 — dispositivo | Um dispositivo possui um ambiente atual. Cada leitura copia o ambiente no instante da ingestão; mover o dispositivo não move leituras antigas. |
| RN004 — exclusão lógica | Cadastros são desativados, preservando histórico. Desativar pai não desativa automaticamente todos os filhos. A consulta operacional considera a hierarquia ativa. Expurgo de telemetria e limpeza de sessões são exceções técnicas de retenção, não exclusão de cadastros. |
| RN005 — alertas | Leitura atual fora da faixa abre ou atualiza episódio. Retorno à faixa encerra o episódio. Reconhecer não encerra. Leituras atrasadas ficam no histórico sem alterar episódios atuais. |
| RN006 — intervalo | O banco prevê intervalo por dispositivo, padrão 30 s e faixa 2–3600 s. Alterar o cadastro não reprograma automaticamente o ESP32. O firmware da bancada da Fase 4 usa 2 s; preparar intervalo de 30 s antes do envio contínuo à nuvem faz parte da Fase 7. |
| RN007 — perfis | Administrador gerencia cadastros da empresa; operador lê, reconhece alertas e muda apenas o indicador de manutenção; leitor somente consulta. Superadmin gerencia empresas e atribui dispositivos pendentes. |

Decisões que substituem ambiguidades anteriores: schema definitivo de 13 tabelas; backend antes do frontend; sem ORM; uso de DHT11 na bancada; adoção global exclusiva por superadmin; deduplicação garantida apenas com timestamp válido; histórico/CSV de até 31 dias e série de até 366 dias.

## 3. Autenticação, autorização e cadastros

- E-mail normalizado para minúsculas; criação de conta exige senha de 12–128 caracteres. Senha é armazenada com Argon2id, nunca em texto aberto.
- Login com e-mail inexistente ou senha incorreta retorna a mesma mensagem. Limites padrão: 20 tentativas por IP e 5 por e-mail em 15 minutos, configuráveis.
- Token de sessão é aleatório; o banco guarda somente SHA-256. Cookie é HttpOnly, SameSite=Lax e Secure em produção. A validade padrão é 8 horas, configurável de 1 a 168 horas.
- Autorização consulta usuário, empresa, expiração e revogação atuais. Desativação ou mudança de perfil não depende de uma sessão antiga em cache.
- Troca de senha/e-mail ou desativação revoga sessões do usuário. Logout revoga sua sessão.
- Sem sessão: 401; perfil inadequado: 403; recurso fora do escopo: 404, sem confirmar sua existência; duplicidade/conflito: 409.
- Empresa e primeiro administrador são criados na mesma transação. Não se pode desativar ou rebaixar o último administrador ativo da empresa.
- Criação/reativação/movimentação de filhos exige ancestrais ativos. Listagens ocultam inativos, salvo solicitação explícita autorizada.
- Limite mínimo não pode exceder máximo. Valores de faixa usam no máximo uma casa decimal. Faixa nula não impõe limite daquele lado.
- Escrita de cadastro e auditoria confirmam juntas. Auditoria não registra senha, hash ou token; registra somente que a senha mudou.
- O indicador `em_manutencao` é informativo nesta versão: não suprime alertas automaticamente.

## 4. Contrato da telemetria e ingestão

Tópicos recebidos: `<prefixo>/<device_id>/dados`, `/porta` e `/status`. Prefixo padrão: `engeasier`. O device_id tem 3–64 caracteres minúsculos, números, hífen ou sublinhado. O identificador no JSON deve corresponder ao tópico.

Exemplo de leitura:

```json
{"id":"esp32-exemplo","temperatura":24.5,"umidade":55.0,"timestamp":"2026-10-14T12:00:00.000Z"}
```

- Temperatura aceita: −50 a 100 °C; umidade: 0 a 100%. São arredondadas para uma casa decimal. JSON estrito rejeita campos desconhecidos, tipos incorretos e números não finitos.
- Payload vazio ou maior que 32 KiB é recusado. Telemetria e porta recebidas como mensagem retida são recusadas, evitando reapresentar valor antigo como nova leitura.
- Timestamp ISO com fuso é usado se plausível: idade máxima padrão 168 horas, configurável até 90 dias; tolerância de futuro padrão 60 segundos. Timestamp ausente, inválido ou fora da janela usa a hora de recebimento. **Não há rejeição automática de todo payload só por hora inválida.**
- Sem timestamp válido do produtor, duas mensagens iguais recebidas em instantes diferentes podem ser duas leituras; não se promete deduplicação nesse caso.
- Chave de deduplicação: dispositivo + medido_em. Mesma chave e mesmos valores: duplicata sem nova gravação. Mesma chave com valores diferentes: conflito, sem sobrescrever o registro anterior.
- Dispositivo desconhecido gera/atualiza pendência com contador e payload normalizado. Não grava leitura. Dispositivo ou hierarquia inativa não gera telemetria operacional.
- Superadmin escolhe ambiente ativo para adotar uma pendência. Adoção, dispositivo e auditoria são atômicos. Não existe autoadoção nem exposição da fila global ao administrador de empresa.
- Nova leitura mais recente atualiza última leitura e contato e marca online. Leitura atrasada entra somente no histórico. Duplicata/conflito não modifica o estado atual.
- Porta aceita JSON booleano ou os textos normalizados do firmware. Só mudança de estado gera evento; evento atrasado não substitui o último.
- Status online recebido ao vivo renova contato. Online retido é ignorado para presença. Offline, incluindo LWT, marca offline sem apagar a última leitura.
- Leitura, episódio e snapshot confirmam na mesma transação. SSE só é emitido depois do commit; rollback não publica atualização.

A conexão pode mudar de fornecedor por configuração de URL, credenciais, CA, client ID e prefixo. Trocar broker não altera política de alerta nem SQL. TLS de produção exige certificado válido e autenticação; não se usa `rejectUnauthorized=false`.

## 5. Alertas e estado do painel

Para cada grandeza (temperatura e umidade):

1. Dentro da faixa, inclusive exatamente no mínimo/máximo: normal.
2. Fora da faixa, com distância ao limite menor ou igual à tolerância: atenção.
3. Distância estritamente maior que a tolerância: crítico. Tolerância nula equivale a zero.

Exemplo: máximo ideal 26 °C e tolerância 2 °C → 26 normal, 27 atenção, 28 atenção e 28,1 crítico.

Um episódio pertence a dispositivo, ambiente, grandeza e sentido (acima/abaixo). Enquanto a violação continua no mesmo sentido/ambiente, preserva valor inicial, maior severidade alcançada e pior extremo. Melhora parcial não reduz a severidade histórica. Retorno à faixa fecha o episódio; mudança direta para o outro lado fecha o anterior e abre outro. Mudança de ambiente é tratada na próxima leitura atual e não altera o vínculo do episódio antigo.

Reconhecimento exige administrador ou operador, registra autor/hora e auditoria. Repetição preserva o primeiro autor/hora; não fecha o alerta. Limites alterados passam a valer nas próximas medições, sem reconstruir episódios antigos.

A view do painel classifica a última leitura como sem_dados, normal, atenção ou crítico. Conexão offline e manutenção são campos independentes: **offline não apaga a última temperatura nem converte sua classificação automaticamente em outro estado**. A hierarquia exibida precisa estar ativa.

## 6. Histórico, série e CSV

- Datas são armazenadas em UTC. Intervalos usam início inclusivo e fim exclusivo: `de <= medido_em < ate`.
- Histórico/CSV: duração máxima de 31 dias. Série por hora: duração máxima de 366 dias. Ultrapassar o limite retorna 400; a API não converte silenciosamente uma consulta em outra.
- Página tem no máximo 500 registros. IDs BIGINT permanecem strings para evitar perda de precisão no JavaScript.
- Série prefere dados brutos da hora enquanto existem; usa resumo somente após a remoção integral daquela hora. Não soma as duas fontes.
- Se o início antecede o corte da retenção, início e fim devem ser horas completas UTC. Caso contrário, 400/HORAS_COMPLETAS_OBRIGATORIAS. Esta regra conservadora foi documentada na Fase 6; consultas recentes aceitam minutos e segundos.
- CSV transmite lotes, revalida sessão e não inclui texto livre de cadastro. Arquivo depende dos dados brutos ainda retidos; permitir uma duração de 31 dias não garante leituras brutas disponíveis de qualquer época.

## 7. Resumos, presença e retenção

- Inicialização e execução horária recalculam as últimas 48 horas completas. A hora em curso permanece nos dados brutos. Reexecutar não duplica resumos.
- A cada minuto, dispositivo ativo/online com contato anterior ao prazo próprio passa a offline. Exatamente no limite não é considerado vencido. A verificação é refeita depois do bloqueio para não sobrescrever contato recém-renovado.
- Expurgo diário às 03:00 America/Bahia: apenas horas inteiras anteriores a 90 dias. O arredondamento conserva até uma hora adicional.
- Antes de apagar, recalcula resumo da hora. Exclusão usa comandos de até 10.000 registros, mas todos os lotes daquela hora e o resumo confirmam juntos. Falha reverte toda aquela hora.
- Alertas permanecem; só sua referência à primeira leitura passa a nula quando a leitura é expurgada.
- Contagem do resumo suporta 65.535 leituras por ambiente/hora. Exceder esse limite interrompe a operação preservando os dados; não trunca o contador.
- Sessões: às 03:30 America/Bahia, remove apenas expiração ou revogação ocorrida há mais de 30 dias. Expiração recente não significa exclusão imediata.
- Locks MySQL impedem sobreposição entre instâncias; resumo e expurgo compartilham trava. Parada aguarda trabalho em andamento antes de fechar o banco.

## 8. SSE e demonstração pública

SSE autenticado pertence à empresa da sessão e transmite invalidação para o cliente reconsultar as APIs. Não expõe payload MQTT bruto. Revalida sessão em eventos e batimentos de 25 segundos. Limites: 50 conexões por empresa e 500 no processo. Cliente lento é desconectado, evitando fila sem limite. Hub é local ao processo; múltiplas instâncias exigiriam distribuição adicional de eventos.

A demonstração da Fase 7 usa `/api/v1/demo/painel`, sem login, com pool MySQL somente leitura. Exibe somente empresas `eh_demo=1` e hierarquia ativa, até 100 itens. Não aceita empresa_id nem outros filtros do visitante. Não divulga device_id/MAC, usuários, e-mails, tokens, credenciais ou auditoria. Não oferece escrita pública. Limite de 60 consultas/minuto por IP do servidor; proxy de hospedagem precisa ser considerado na implantação.

O seed novo usa dados fictícios e `stma-demo-simulado-001`. Não converte a empresa real Laboratório STMA em pública nem usa o ID físico do ESP32. Execução é explícita, transacional e não duplica uma demonstração já existente. O arquivo de referência original em docs/03-implementacao/stma_seed_demo.sql permanece preservado; o seed executável é backend/seeds/stma_seed_demo.sql.

## 9. Evidências e limites atuais

Testes de referência: `auth*`, `cadastros*`, `telemetry*`, `mqtt*`, `alert-policy*`, `alert-episodes*`, `history*`, `monitoring*`, `stream*`, `maintenance*` e `demo*` em backend/tests. O roteiro identifica o CI e as validações físicas de cada fase. A simples presença de código/teste não representa implantação concluída.

Fases 1–6 concluídas; Fase 7 em implementação. Hospedagem do processo Node, broker remoto TLS, eventual atualização do firmware e medição publicada → API/SSE em até 5 segundos ainda dependem da preparação e validação correspondentes. O frontend não foi iniciado; o critério visual de atualização de tela só poderá ser comprovado com ele. Nesta fase, a evidência do backend deve medir publicação → persistência → consulta do painel/aviso SSE.

Pendências funcionais explicitadas: configuração do intervalo não é enviada à placa; firmware anterior é QoS 0 e sem NTP; não há fila durável de leituras no ESP32; não há distribuição SSE entre instâncias. Não prometer entrega exatamente uma vez: QoS 1 pode reenviar e a aplicação deduplica quando dispõe de timestamp válido.

## Complemento da Fase 3 do frontend — 16/10/2026

A seleção de destino para adoção é consultada em
`GET /api/v1/dispositivos-pendentes/destinos`, com empresa e paginação explícitas.
Somente superadmin pode consultar. Empresa, unidade, setor e ambiente devem estar
ativos; o resultado limita-se aos nomes da hierarquia e ID do ambiente, sem dados
de telemetria ou usuários. A transação de adoção volta a validar esses vínculos.
Implementação: `pending.service.ts`, `pending.routes.ts` e
`mysql-pending.repository.ts`, em `backend/src/modules/telemetria`.

No frontend, `features/cadastros/model.ts` valida entradas e constrói o payload;
`cadastro-form.tsx` e `pending-page.tsx` conduzem os fluxos. Essas validações auxiliam
o usuário, mas não substituem as regras dos serviços/repositórios do backend.
Desativar mantém histórico; reativar depende da hierarquia ativa. Nenhuma exclusão
física foi acrescentada às interfaces.

## Apresentação do painel — Fase 4 do frontend (17/10/2026)

A view do backend classifica cada dispositivo. A interface agrupa dispositivos por
ambiente e exibe a maior severidade entre os que estão online, fora de manutenção e
com leitura. Se não houver leitura nessas condições, mostra “Sem dados atuais”.
Isso é um resumo de apresentação, não altera classificação, limites ou episódios
persistidos. Dispositivos offline/manutenção mostram a data da última leitura;
valores antigos não são destacados como medição atual.

O indicador SSE descreve a conexão do navegador ao backend, não a saúde do broker.
Reconsulta após aviso SSE usa o escopo da sessão. Sem SSE, consulta a cada 30 s;
após retorno da rede, recria a conexão sem manter duas simultâneas. Falha de rede
não equivale a logout; HTTP 401 invalida a sessão. Implementação em
`frontend/src/features/painel`, com estado de sessão em `features/auth/auth.ts`.

## Complemento da Fase 5 do frontend — 17/10/2026

Histórico e CSV consultam intervalos [início, fim) de no máximo 31 dias; série por
hora até 366 dias. Datas de entrada/exibição: America/Bahia; API e CSV: UTC.
Resumo antigo exige horas completas. A validação de negócio autoritativa continua
em `backend/src/modules/telemetria/history.service.ts`; o frontend auxilia em
`features/ambiente/model.ts` e não substitui a validação no servidor.

A tabela de leituras usa paginação do servidor. O gráfico reúne dispositivos do
ambiente e utiliza médias ponderadas, mínimos e máximos, com até 240 intervalos;
a tabela alternativa preserva pontos originais da série. Faixas ideais mostradas
são as atuais, sem reclassificar episódios passados. Lacunas não viram zeros.

Alertas permanecem isolados por empresa. O filtro opcional `ambiente_id` atua no
SQL antes da paginação e não substitui o escopo da sessão. Somente operador e
administrador reconhecem, com confirmação na interface e auditoria no backend.
Reconhecer registra ciência; encerramento depende das regras de episódio.
Durações de alertas abertos correspondem à última consulta, explicitada na tela.
Fontes: `monitoring.service.ts`, `mysql-monitoring.repository.ts` e frontend
`features/alertas/alerts-page.tsx`. Não há regra de encerramento no frontend.

## Complemento do MVP: porta, LED e limite — 19/10/2026

- Telemetria de temperatura/umidade entra somente pelo JSON `/dados` por placa.
  Tópicos escalares/globais da página antiga não geram leituras adicionais.
- Allowlist `MQTT_DEVICE_IDS` restringe quais IDs este backend consome/comanda.
  No broker público isso não autentica a origem; terceiros podem forjar o ID.
- Estado `/controle` exige id correspondente ao tópico, booleano LED, limite
  nulo ou 0–50 °C e UUID de comando ou nulo; mensagem retida é recusada.
- O último estado de porta exibido vem de `evento_porta`; sem novo contato não
  afirmar que um estado antigo ainda descreve a situação física atual.
- Administrador e operador da empresa podem comandar. Leitor consulta.
  Superadmin mantém as funções globais previstas, sem assumir empresa implicitamente.
- Comando exige placa ativa, hierarquia ativa, online, fora de manutenção e estado
  recebido nos últimos 30 segundos. Outra empresa recebe 404 sem revelar o cadastro.
- Limite automático do LED é independente das faixas ideais do ambiente. Valores
  aceitos na API: nulo (desativar) ou 0–50 °C com uma casa decimal. Histerese 0,5 °C:
  acende em temperatura >= limite, apaga abaixo de limite − 0,5 °C.
- Manual exige automático desativado. Desativar automático mantém o último estado
  do LED; o usuário pode então comandá-lo. Reboot perde limite/estado do firmware.
- Comando recebe UUID e validade de 15 s; MQTT publica QoS 1 sem retain. O firmware
  exige NTP e recusa expirados. UUID repetido imediatamente não reaplica o comando.
- Auditoria registra **solicitação**, não prova de execução. HTTP 202 confirma
  aceitação pelo broker. Confirmação física depende do UUID recebido em `/controle`
  e persistido. Erro/timeout não garante que o dispositivo não executou.
- A bancada usa amostragem configurável de 15 s para respeitar a latência remota;
  publicações do firmware são QoS 0 e não há recuperação garantida de perdas.

Fontes de implementação: `backend/src/modules/telemetria/control.service.ts`,
`control.routes.ts`, `mysql-control.repository.ts`, `telemetry.service.ts`,
`mysql-telemetry.repository.ts` e `firmware/mqtt_esp32_limite_stma_v2`.
Interface: `frontend/src/features/ambiente/device-control.tsx`.
