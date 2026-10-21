# Aceite manual da Fase 6 — Safari em iPhone/iPad

Preparado em 21/10/2026. Este roteiro ainda não representa um teste executado.
A matriz automatizada WebKit já passou; falta conferir um aparelho real.

## Preparação na mesma rede Wi-Fi

1. Mantenha o ESP32 e o computador ligados. Confira o painel atual em
   http://127.0.0.1:5173 e use os acessos privados do laboratório Aiven.
2. No computador, execute `ipconfig` e anote o IPv4 do adaptador Wi-Fi conectado.
   Nos exemplos abaixo, substitua `192.168.0.100` pelo endereço efetivo.
3. Pare o backend atual com Ctrl+C **antes** de iniciar a sessão de teste.
   Não rode dois consumidores MQTT com o mesmo client ID. No terminal `backend`:

   ```powershell
   $env:PUBLIC_ORIGIN='http://192.168.0.100:5173'
   npm run dev:mvp
   ```

   O perfil continua Aiven + broker público. A variável muda somente a origem
   autorizada durante esse processo; não sobrescreve `.env` ou `.env.mvp`.
4. Pare o Vite atual com Ctrl+C. No terminal `frontend`, execute:

   ```powershell
   npm run dev -- --host 192.168.0.100
   ```

   O proxy continua encaminhando `/api` ao Node local. Se o Windows solicitar
   acesso à rede, use a rede privada da bancada. Não é necessário publicar portas
   no roteador para testar entre dispositivos da mesma rede.
5. No Safari do aparelho, abra `http://192.168.0.100:5173`. Não use localhost
   nem 127.0.0.1 no telefone: eles apontam para o próprio aparelho.
6. Durante esse teste, faça login/alterações pelo endereço IP configurado. A
   proteção de origem continua ativa e pode recusar escritas por outro endereço.

## Casos de aceite

Preencha resultado e observações após testar. Não registre senha, token de sessão
ou captura da tela de credenciais.

| Caso | Ação e resultado esperado | Resultado / observações |
| --- | --- | --- |
| Identificação | Registrar modelo do aparelho e versão iOS/iPadOS/Safari. | Pendente |
| Login | Conta válida abre a tela permitida ao perfil; erro inválido é compreensível. | Pendente |
| Menu | Abrir, navegar e fechar em retrato; repetir em paisagem. Sem rolagem horizontal. | Pendente |
| Painel real | Localizar Bancada ESP32 e conferir valores/horário com o computador. Com ESP32 online, observar pelo menos duas novas datas de leitura. | Pendente |
| Estado antigo | Offline/sem dados não deve parecer medição atual. Não é preciso desligar a placa apenas para este caso; pode usar evidência disponível. | Pendente |
| Detalhe | Abrir o ambiente, ler porta, última leitura e estado do controle. | Pendente |
| Temas | Alternar claro/escuro; recarregar e conferir preferência e legibilidade. | Pendente |
| Histórico | Filtrar intervalo válido; paginar; conferir datas Bahia e gráfico/tabela. | Pendente |
| CSV | Exportar intervalo curto e localizar o arquivo pelo Safari/Arquivos; verificar cabeçalho e dados, sem truncamento. | Pendente |
| Alertas | Consultar e filtrar. Reconhecimento é exclusivo de administrador/operador e não encerra o episódio. | Pendente |
| Cadastros | Com administrador, abrir formulário e verificar rótulos, teclado e mensagens, sem precisar criar registros reais. | Pendente |
| Leitor | Conta leitor consulta; não recebe controles de escrita nem acesso a cadastros. | Pendente |
| Sessão | Recarregar preserva acesso válido; sair leva ao login e a página protegida exige autenticação novamente. | Pendente |
| Demonstração | Se habilitada no backend, `/demo` abre sem login, com dados fictícios identificados e nenhuma escrita. Se desabilitada, apresenta indisponibilidade. | Pendente |
| Acessibilidade | Com VoiceOver disponível, conferir leitura de rótulos/erros, nomes de botões e ordem de navegação. | Pendente |

A frequência da amostragem do ESP32 é 15 s neste MVP; a chegada depende também da
rede e do MySQL remoto. O indicador SSE descreve navegador–API, não autenticação
ou disponibilidade do broker. Conexão WebKit automatizada não equivale a este aceite.

## Voltar ao funcionamento habitual

1. Pare backend e Vite de teste com Ctrl+C.
2. No terminal backend, remova o override e reinicie:

   ```powershell
   Remove-Item Env:PUBLIC_ORIGIN -ErrorAction SilentlyContinue
   npm run dev:mvp
   ```

3. No frontend, execute `npm run dev` sem `--host` e retorne a
   http://127.0.0.1:5173. O arquivo `.env.mvp` original permanece preservado.
4. Registre resultados no roteiro do frontend, incluindo o que não foi possível
   executar. A publicação Vercel e o teste por HTTPS remoto são um aceite separado,
   ainda dependente da URL pública da API e da criação do projeto Vercel.
