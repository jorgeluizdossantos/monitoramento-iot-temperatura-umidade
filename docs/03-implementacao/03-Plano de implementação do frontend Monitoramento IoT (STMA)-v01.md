# Plano de implementação do frontend: Monitoramento IoT (STMA)

Oct 12, 2026 · @Jorge Luiz dos Santos

## 1. Resumo

**Acompanhamento — 14/10/2026:** o proprietário autorizou iniciar este plano com a Fase 7
do backend ainda aberta. Fases 1 e 2 implementadas em 15/10/2026, Fase 3 em 16/10/2026 e Fases 4 e 5 em 17/10/2026; Fase 6 aguarda aceite. React 18/Vite/TypeScript substituem a reserva antiga
de frontend sem framework. Registro didático: `docs/roteiro-frontend.md`.

Correções de contrato conforme backend já aprovado: fila global/adoção exclusivas do
superadmin; prefixo HTTP `/api/v1`; SSE emite avisos de reconsulta após commit;
histórico/CSV limitados a 31 dias e série a 366 dias. Estas decisões prevalecem sobre
menções anteriores a adoção por administrador ou eventos com leituras completas.

Checklist da Fase 1:
- [x] Revisar plano, design system e contrato HTTP/autenticação.
- [x] Criar estrutura React, layout responsivo, rotas de preparação e cliente HTTP com Zod.
- [x] Configurar proxy de desenvolvimento na mesma origem e pipeline frontend.
- [x] Conferir backend local: login, painel, alertas, histórico, série, CSV, SSE e logout.
- [x] Validar build, quatro testes de contrato e quatro testes de navegador (360/768/1440 px); imagens revisadas, sem transbordamento.
- [x] Publicar etapa no GitHub e confirmar CI antes do aceite: commit `768c18b`, execução frontend `38765158159` aprovada e backend `38765158163` aprovado.

Evidências e comandos no roteiro. Tag da entrega: `frontend-fase-1`.
Referência visual principal confirmada: pasta `02-projeto/02-prototipo-stitch/web`;
adaptar os desenhos ao escopo funcional do plano, sem copiar recursos não previstos.

Checklist da Fase 2 — autorizada em 15/10/2026:
- [x] Login real com React Hook Form/Zod e mensagens acessíveis.
- [x] Sessão em memória, restauração por `/auth/me` e logout no servidor.
- [x] Guards e menus dos quatro perfis, acesso negado e preservação do destino.
- [x] Doze testes unitários, treze testes Edge e build aprovados; imagens revisadas.
- [x] Formulário validado com API/MySQL locais: login, recarga, cookie HttpOnly e logout.
- [x] Publicação no commit `df6f5fa`; CI frontend `38768198616` aprovado (12 testes unitários, build e 13 testes Chromium). Tag: `frontend-fase-2`.

Pendências da Fase 7 do backend permanecem no seu plano. Próxima fase do frontend,
somente após aceite desta entrega: Fase 6 — acabamento, demonstração e implantação.

Checklist da Fase 3 — 16/10/2026:
- [x] Listas e formulários das seis entidades, com paginação e filtro de inativos.
- [x] Criação, edição, desativação com confirmação e reativação.
- [x] Erros do backend nos campos, faixas e senha opcional na edição.
- [x] Fila de placas, payload e adoção exclusiva do superadmin com destino hierárquico.
- [x] Endpoint restrito de destinos; sem ampliar acesso à telemetria.
- [x] 15 testes frontend, 23 testes Edge, 15 testes de integração MySQL e build aprovados.
- [x] Revisão visual e formulário conectado à API local validados; roteiro atualizado.
- [x] Publicado no commit `b4b0162`; CI frontend `38901359475` e backend `38901359464` aprovados. Tag: `frontend-fase-3`.
Checklist da Fase 4 — concluída tecnicamente (17/10/2026):
- [x] Cartões reais por ambiente, filtros hierárquicos e detalhe atual.
- [x] Contrato validado, estados e horário/valores formatados; leitura offline não parece atual.
- [x] SSE, agrupamento de avisos, fallback de 30 s e recriação da conexão após retorno da rede.
- [x] 22 testes unitários e build aprovados.
- [x] 31 testes Edge e 8 WebKit aprovados; revisão visual em 360/1440 px.
- [x] MQTT → MySQL → SSE → cartão em 332 ms, duas leituras persistidas e reconexão confirmada localmente.
- [x] Publicado no commit `b114315`; CI frontend `39025838662` e backend `39025838676` aprovados. Tag: `frontend-fase-4`.
Checklist da Fase 5 — autorizada e implementada em 17/10/2026:
- [x] Histórico paginado no servidor, filtros de período e datas Bahia→UTC.
- [x] Gráficos Recharts com faixa ideal atual e série por hora; até 240 intervalos, extremos preservados e tabela textual.
- [x] CSV completo de até 31 dias; série de até 366 dias; cancelamento e erros tratados.
- [x] Alertas por situação, duração, severidade e reconhecimento por operador/administrador.
- [x] Alertas do ambiente com filtro SQL por ambiente e empresa da sessão.
- [x] 27 testes unitários, 37 Edge, seis WebKit, cinco integrações MySQL e builds aprovados.
- [x] Prova real de 100 mil leituras: 20 linhas na tela, primeira página em 551 ms, CSV com 100.001 linhas e reconhecimento persistido.
- [x] Plano, roteiro didático e regras de negócio atualizados.
- [x] Publicado no commit `8c4bedf`; CI frontend `39045798482` e backend `39045798469` aprovados. Tag: `frontend-fase-5`.

**Falta uma fase após o aceite da Fase 5:** Fase 6 — demonstração, acessibilidade,
testes finais nos navegadores, README de implantação e deploy. A implantação depende
da resolução das pendências da Fase 7 do backend; não foi antecipada nesta entrega.

O frontend é uma aplicação web responsiva (mobile-first) que consome a API REST do backend e mostra, em tempo real, a temperatura e a umidade de cada ambiente, com cadastros, histórico, gráficos e alertas conforme o perfil do usuário. O plano tem seis fases, do esqueleto até a implantação, e cada uma termina com um critério de aceite. Ele depende do plano do backend: as fases do frontend 3 a 5 só fecham quando as fases 3 a 5 do backend entregam as rotas correspondentes.

### 1.1 Stack proposta

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Base | React 18, Vite e TypeScript estrito | Mesma stack dos seus outros projetos |
| Estilo | Tailwind CSS | Previsto no `requisitos.md` e bom para mobile-first |
| Dados do servidor | TanStack Query | Cache, recarga e estado de erro e de carregamento prontos |
| Estado local | Zustand | Só para sessão, filtros e preferências; o resto vem do servidor |
| Formulários | React Hook Form e Zod | Validação igual à do backend, mensagens em português |
| Rotas | React Router | Navegação hierárquica e rotas protegidas por perfil |
| Gráficos | Recharts | Linha com faixa ideal e série por hora, sem código de baixo nível |
| Tempo real | `EventSource` (Server-Sent Events) | Fala com o `GET /stream` do backend, com recarga automática da conexão |
| Testes | Vitest, Testing Library e Playwright | Unidade, componente e fluxo completo no navegador |
| Hospedagem | Vercel | Mesma hospedagem dos seus outros frontends |

### 1.2 Decisões que mudam o `requisitos.md`

- **React em vez de HTML, JavaScript e CSS puros.** O documento de requisitos descreve HTML e JavaScript, mas o painel tem muitas telas com estado compartilhado (filtros, sessão, alertas ao vivo); React com a sua stack custa menos e é mais fácil de manter. Se o portfólio exigir JavaScript puro, o plano de telas e de fases continua válido e só a seção 2 muda.
- **Tempo real pelo backend, não pelo broker.** O painel assina o `GET /stream` do serviço em vez de abrir MQTT sobre WebSocket direto no broker. Assinar o broker direto exigiria credencial de broker no navegador, e num broker público qualquer visitante leria os dados de todas as empresas; com o stream, o servidor repassa só o que a sessão pode ver. O RNF002 (5 segundos) continua valendo.
- **Horários em UTC no servidor, America/Bahia na tela.** O frontend converte para o fuso do usuário na exibição e envia períodos de consulta em UTC.

## 2. Arquitetura

O código se organiza por funcionalidade, não por tipo de arquivo: cada pasta de `features` leva suas telas, seus componentes, seus hooks de dados e seus esquemas Zod. O que é usado por mais de uma funcionalidade sobe para `shared`.

```text
src/
  app/           roteador, provedores (Query, sessão), layout e menu
  features/
    auth/        login, sessão, guarda de rota por perfil
    painel/      cartões de ambiente, navegação hierárquica, stream
    ambiente/    detalhe, histórico, gráficos, exportação CSV
    alertas/     lista e reconhecimento
    cadastros/   empresas, unidades, setores, ambientes, dispositivos, usuários, pendentes
    demo/        painel público de demonstração
  shared/
    api/         cliente HTTP, tratamento de erro, tipos das respostas
    ui/          botão, campo, tabela, cartão, aviso, estado vazio
    lib/         datas e números em pt-BR, conversão de fuso
  main.tsx
tests/
```

### 2.1 Fluxo de dados

- **Dados do servidor** (cadastros, histórico, alertas) vivem no cache do TanStack Query, com uma chave por consulta, por exemplo `['leituras', ambienteId, de, ate, pagina]`. Depois de uma escrita, a chave afetada é invalidada.
- **Estado local** (usuário logado, filtros do histórico, tema) fica no Zustand. A empresa não é enviada nas requisições: o backend a lê da sessão.
- **Tempo real:** `connectPanel` abre um único `EventSource`; cada aviso solicita reconsulta do painel no escopo da empresa. Não há ID de ambiente no evento atual. Cartões sem alterações reaproveitam referências do cache. Alertas consultam a cada 30 s enquanto ativos, sem abrir outra conexão SSE.
- **Validação:** os mesmos esquemas Zod validam o formulário e as respostas da API, de modo que um campo que o backend renomeie quebre num teste e não em produção.
- **Erros:** o cliente HTTP converte o formato de erro do backend em um objeto único; 401 leva ao login, 403 e 404 à tela de acesso negado, 400 preenche os erros dos campos.

## 3. Telas e fluxos

O painel é a tela inicial depois do login; os cadastros ficam atrás de um menu visível só ao administrador. O menu esconde o que o perfil não pode usar, mas quem decide é o backend: o frontend trata 403 e 404 mostrando uma tela de acesso negado.

### 3.1 Mapa de telas

| Tela | Rota | Perfil | O que mostra | Requisitos |
| --- | --- | --- | --- | --- |
| Login | `/entrar` | público | E-mail, senha, erro claro, saída por logout em qualquer tela | RF001 |
| Painel | `/painel` | leitor | Um cartão por ambiente com temperatura, umidade, estado e situação do dispositivo; navegação por unidade e setor | RF009, RF010, RF014 |
| Ambiente | `/ambientes/:id` | leitor | Leitura atual, gráfico das últimas horas com a faixa ideal, alertas do ambiente | RF009, RF012, RF013 |
| Histórico | `/ambientes/:id/historico` | leitor | Filtro de período, tabela paginada, gráfico e botão de exportar CSV | RF011, RF012, RF016 |
| Alertas | `/alertas` | leitor; operador reconhece | Alertas abertos e encerrados, com severidade, valor extremo e duração | RF013 |
| Cadastros | `/cadastros/:entidade` | administrador (empresas: superadmin) | Lista, criação, edição e desativação de empresas, unidades, setores, ambientes, dispositivos e usuários | RF002 a RF007, RF015 |
| Placas pendentes | `/cadastros/pendentes` | superadmin | IDs que publicaram e ainda não têm cadastro, com último payload e ação de adotar | RF007 |
| Demonstração | `/demo` | público | O painel da empresa de demonstração, somente leitura | RF017 |

### 3.2 Como o estado do ambiente aparece

O backend devolve `normal`, `atencao`, `critico` ou `sem_dados`, além de `online` ou `offline` para o dispositivo. A cor nunca é o único sinal: cada estado tem ícone e rótulo escrito ("Normal", "Atenção", "Crítico", "Sem dados"), e um dispositivo offline mostra a hora da última leitura em vez de um valor que parece atual.

### 3.3 Fluxo de cadastrar uma placa nova

1. Após ligar o ESP32, o superadmin abre **Placas pendentes**; o `device_id` aparece com a hora do primeiro contato.
2. Ele confere o último payload, para ter certeza de que é a placa certa.
3. Escolhe empresa e ambiente numa lista hierárquica (unidade, setor, ambiente), informa nome opcional e sensor. Intervalo e timeout são ajustados pelo administrador em Dispositivos após adoção.
4. A tela chama `POST /dispositivos-pendentes/:id/adotar`; a partir daí as leituras passam a ser gravadas e o cartão aparece no painel.

## 4. Fases de implementação

O frontend anda um passo atrás do backend. Enquanto uma rota não existe, a fase usa um servidor simulado (MSW) com as respostas do contrato, para não ficar parada.

| Fase | Entrega | Requisitos | Depende do backend | Critério de aceite |
| --- | --- | --- | --- | --- |
| 1. Esqueleto | Projeto Vite com TypeScript e Tailwind, layout com menu, rotas, cliente HTTP tipado e CI | RNF001, RNF006 | Fase 1 | Sem rolagem horizontal em tela de 360 px; build e testes passam no CI |
| 2. Login e perfis | Tela de login, sessão por `GET /auth/me`, rotas protegidas, menu por perfil, tela de acesso negado | RF001, RF015 | Fase 2 | Leitor não vê o menu de cadastros; sessão expirada volta ao login sem perder o destino |
| 3. Cadastros | Listas e formulários das seis entidades, desativação com confirmação, placas pendentes e adoção | RF002 a RF007 | Fase 3 | 100% dos cadastros operam pela interface; erro do servidor aparece no campo certo |
| 4. Painel em tempo real | Cartões por ambiente, navegação hierárquica, conexão ao `GET /stream`, indicador de reconexão | RF009, RF010, RF014, RNF002, RNF005 | Fases 4 e 5 | Leitura publicada aparece em até 5 s sem recarregar; derrubar a rede mostra o aviso e a tela volta sozinha |
| 5. Histórico, gráficos e alertas | Histórico paginado, gráfico com faixa ideal, série por hora, lista de alertas, exportação CSV | RF011, RF012, RF013, RF016 | Fase 5 | Período com 100.000 leituras abre sem travar, paginado; o CSV baixa com data/hora, temperatura e umidade |
| 6. Acabamento e demonstração | Modo demonstração, revisão de acessibilidade, testes de fluxo completo, README e deploy | RF017, RNF004, RNF008 | Fase 7 | Funciona em Chrome, Firefox, Edge e Safari mobile; um terceiro sobe o projeto pelo README |

## 5. Design responsivo, acessibilidade, desempenho e testes

### 5.1 Responsividade e acessibilidade

- Projetar primeiro para 360 px e ampliar: cartões em uma coluna no celular, grade no tablet e no desktop; tabelas largas viram listas de cartões abaixo de 640 px (RNF001).
- Contraste de texto de pelo menos 4,5:1 nos dois temas, claro e escuro, e foco visível em todo controle.
- Estado do ambiente sempre com ícone e texto, além da cor (seção 3.2); gráficos com descrição textual e a tabela de dados disponível.
- Formulários com rótulo associado ao campo, erro lido por leitor de tela e navegação completa pelo teclado.
- Datas e números no formato brasileiro (dd/mm/aaaa, vírgula decimal) e fuso America/Bahia.

### 5.2 Desempenho

- Rotas carregadas sob demanda (`lazy`), para o login e o painel não baixarem o código dos cadastros.
- O histórico nunca carrega todas as leituras: a tabela pagina no servidor e o gráfico de períodos longos usa a série por hora, com no máximo algumas centenas de pontos.
- Um único `EventSource` por aba; o contrato atual envia aviso por empresa; a aplicação reconsulta o painel e reaproveita os cartões sem alterações por compartilhamento estrutural e memoização.
- Quando o stream cai, a tela volta a consultar `GET /painel` a cada 30 s até a reconexão.

### 5.3 Testes

| Nível | O que cobre | Ferramenta |
| --- | --- | --- |
| Unidade | Formatação de datas e números, regras de exibição de estado, esquemas Zod | Vitest |
| Componente | Cartão de ambiente nos quatro estados, formulários com erro, menu por perfil | Testing Library |
| Fluxo completo | Login, ver o painel, cadastrar ambiente e dispositivo, filtrar histórico, baixar CSV | Playwright contra o backend de teste |
| Navegadores | Chrome, Firefox, Edge e Safari mobile (RNF004) | Playwright e verificação manual no celular |
| Acessibilidade | Falhas automáticas nas telas principais | axe no Playwright |

## 6. Implantação, riscos e próximos passos

### 6.1 Implantação

O frontend vai para a Vercel a partir do GitHub, com uma implantação de pré-visualização por pull request. O navegador chama `/api/...` no próprio domínio do frontend, e a Vercel repassa (rewrite) para o backend. Assim o cookie de sessão fica no mesmo site, o `SameSite=Lax` do backend funciona e não há CORS para configurar. O único valor de ambiente do frontend é o endereço do backend no arquivo de rewrite; não há segredo no código do navegador (RNF003).

### 6.2 Riscos

| Risco | Efeito | Mitigação |
| --- | --- | --- |
| Backend e frontend em domínios diferentes sem rewrite | Cookie de sessão não é enviado e o login não funciona | Rewrite da Vercel, como na seção 6.1 |
| Proxy da hospedagem corta conexões longas | O stream cai a cada poucos minutos | Backend envia um comentário de batimento a cada 25 s; o frontend já reconecta e cai para consulta periódica |
| Rotas do backend atrasadas | Fase do frontend parada | Servidor simulado (MSW) com o contrato das rotas da seção 4.2 do plano do backend |
| Muitos cartões atualizando ao mesmo tempo | Tela lenta em celular simples | Atualizar só o ambiente afetado; evitar redesenhar a lista inteira |
| Safari mobile com comportamento diferente | Quebra em parte dos usuários | Testar cedo, na fase 4, e não só no fim |

### 6.3 Próximos passos

- [x] Aprovar React: autorizado pelo proprietário em 14/10/2026.
- [x] Conferir contratos de painel e stream: implementados e validados nas fases 1 e 4.
- [x] Criar repositório, projeto Vite e CI: Fase 1 concluída.
- [x] Aplicar identidade visual STITCH/web, adaptada ao plano.
- [ ] Obter aceite da Fase 5 e iniciar a Fase 6.
- [ ] Resolver hospedagem e configuração remota do backend antes do deploy completo.
