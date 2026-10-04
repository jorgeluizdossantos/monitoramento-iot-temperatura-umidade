# Controle da Fase 0 — Setup

Data: 04/10/2026. Escopo: T0.1–T0.4 do plano de implementação.

## Documentação analisada

As referências foram copiadas para `docs/referencias/` em UTF-8 para permitir
clonagem independente da pasta externa. Os originais permaneceram intactos.
O pedido do usuário governa a execução por fases; sugestões e prompts históricos
nos documentos não representam autorização para antecipar funcionalidades.

## Decisões e lacunas

- `projeto.md` está truncado no diagrama; `componentes-responsabilidades.md`
  termina no payload MQTT. `componentes-e-responsabiliades.md` complementa os contratos.
- O SQL original termina em `CREATE` antes de ambiente. As três primeiras
  tabelas foram preservadas; as outras cinco foram completadas a partir dos
  requisitos, seed e casos de teste.
- `status` do dispositivo permanece `ativo/inativo`, como no seed e CT015.
  `status_conexao` armazena `online/offline`, evitando misturar LWT com exclusão
  lógica. A futura ingestão deverá respeitar essa separação.
- Unicidade `(dispositivo_id, lida_em)` prepara a idempotência prevista no
  CT020B; índice `(ambiente_id, lida_em)` atende à estrutura de RNF007.
  Isso não comprova ainda desempenho com 100 mil registros.
- As faixas ideais aceitam NULL, conforme RF005. CHECK impede mínimo maior
  que máximo; telemetria limita temperatura a -40–80 °C e umidade a 0–100%.
- Node.js 22.23.3 já instalado foi utilizado conforme Node 18+ no design e
  plano de testes, em vez de trocar o runtime global pela versão 18 do plano.
- MySQL 8 em Docker é um recurso local de setup reproduzível. Não altera a
  arquitetura nem substitui MySQL por outro SGBD. A porta 13306 evita conflito
  com serviços existentes (3307 estava ocupada).
- O plano prioriza Must, mas inclui Should nas tarefas de fases futuras.
  Essa divergência deve ser resolvida ao analisar cada fase, sem antecipação.
- O contrato de isolamento por empresa deverá obedecer RN001. ACLs WSS e
  suporte efetivo de publicação QoS 1 da biblioteca embarcada precisam ser
  revistos na entrada das fases consumidoras.

## Critério de saída

A fase só estará encerrada quando o repositório estiver clonável no GitHub,
o MySQL estiver populado, as dependências instaladas e a autenticação/ping
do broker confirmada. Consulte o registro de validação abaixo.

As fases 1–6 permanecem não iniciadas.

## Registro de validação — 04/10/2026

| Item | Resultado | Evidência |
|---|---|---|
| T0.1 estrutura, MIT, README e Git local | Preparado | Diretórios versionáveis, branch main |
| T0.1 repositório GitHub clonável | Pendente | Usuário informou não possuir repositório; autenticação e destino solicitados |
| T0.2 HiveMQ TLS/WSS | Bloqueado por configuração externa | Cluster ainda não criado; script check:mqtt preparado |
| T0.3 MySQL operacional | Aprovado | Docker Compose saudável, MySQL 8.0.46 em 127.0.0.1:13306 |
| T0.3 schema/seed | Aprovado | 8 tabelas; contagens 2/3/4/4/4/4/9/2, respectivamente empresa/unidade/setor/ambiente/dispositivo/usuario/leitura/alerta |
| T0.3 integridade | Aprovado | FK inválida, faixa invertida e leitura duplicada rejeitadas; histórico preservado na desativação, com rollback |
| CT040, porção banco | Aprovado | Quatro hashes bcrypt conferidos com compare; não equivale a teste de login |
| CT041, arquivos locais | Aprovado | git check-ignore confirma .env, node_modules e config.h ignorados |
| T0.4 dependências | Aprovado | npm install: 137 pacotes, auditoria sem vulnerabilidades reportadas, package-lock.json gerado |
| Sintaxe dos scripts | Aprovado | node --check nos quatro scripts |

A instalação npm exigiu `NODE_OPTIONS=--use-system-ca`, mantendo TLS ativo.
Não foram executados os testes de API, ingestão, firmware, interface ou latência,
pois pertencem às próximas fases. Não há comprovação de conectividade MQTT
até a configuração real do cluster. **Fase 0 ainda não encerrada.**
