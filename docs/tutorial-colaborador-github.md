# Roteiro: wxlv7h convida jorgeluizdossantos para colaborar

Atualizado em 08/10/2026. Este roteiro pode ser enviado ao proprietário wxlv7h.

## 1. Entender o acesso solicitado

| Papel | Conta |
|---|---|
| Proprietário do segundo repositório | [wxlv7h](https://github.com/wxlv7h) |
| Colaborador a convidar | [jorgeluizdossantos](https://github.com/jorgeluizdossantos) |
| Repositório já publicado | [jorgeluizdossantos/monitoramento-iot-temperatura-umidade](https://github.com/jorgeluizdossantos/monitoramento-iot-temperatura-umidade) |
| Nome sugerido para o segundo repositório | monitoramento-iot-temperatura-umidade |

O convite concede acesso ao **repositório escolhido**, não à conta inteira nem
a todos os projetos de wxlv7h. Em repositório de conta pessoal, colaboradores
têm leitura e escrita; não é necessário procurar um seletor de papel “Write”.
O proprietário continua responsável pela administração. Em repositório público,
qualquer visitante já consegue ler; o convite concede a colaboração com escrita.
Regras de proteção de branches podem exigir pull request mesmo para colaboradores.
[Referência de permissões](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository).

Não é necessário compartilhar senha, token ou acesso à conta. Cada pessoa usa
sua própria conta. O username de Jorge é `jorgeluizdossantos`, sem ponto final.

## 2. Preparação — ações de wxlv7h

1. Entre no GitHub com a conta **wxlv7h**.
2. Confirme no menu da foto de perfil que essa é a conta conectada.
3. Se o repositório já existir, abra-o e avance para a seção 3.
4. Caso não exista, acesse [Criar repositório](https://github.com/new).
5. Em **Owner**, escolha `wxlv7h`.
6. Em **Repository name**, use `monitoramento-iot-temperatura-umidade`, ou outro
   nome acordado com Jorge. Anote o nome exato.
7. Escolha **Public** se o objetivo for disponibilizar o portfólio publicamente.
8. Para receber o histórico que já existe, crie o repositório **vazio**: não
   inicialize README, .gitignore ou licença. Esses arquivos já estão no projeto.
9. Clique em **Create repository** e guarde a URL exibida.

[Referência para criação do repositório](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).

Com o nome sugerido, o endereço esperado será
`https://github.com/wxlv7h/monitoramento-iot-temperatura-umidade`.
Esse endereço é uma previsão; a existência do segundo repositório ainda não
foi verificada. Se preferirem um fork do projeto existente, o convite também
deve ser enviado no repositório pertencente a wxlv7h.

## 3. Enviar o convite — ações de wxlv7h

1. Abra a página do repositório que receberá o projeto.
2. Confira no cabeçalho que o proprietário é **wxlv7h**.
3. Abra **Settings** nas abas do repositório. Em telas estreitas, procure no
   menu de abas adicionais. Não use as configurações gerais do perfil.
4. Na lateral, em **Access**, selecione **Collaborators**.
5. Se o GitHub solicitar confirmação de identidade, conclua-a na própria conta.
6. Clique em **Add people**.
7. Digite exatamente **jorgeluizdossantos**.
8. Selecione o resultado correspondente e confira o username antes de prosseguir.
9. Confirme no botão **Add jorgeluizdossantos to ...**, com o nome do repositório.
10. Confira que o convite aparece pendente e avise Jorge, enviando a URL do
    repositório. O acesso só estará ativo depois da aceitação.

Passos conferidos no [guia oficial para convidar colaboradores](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository).

## 4. Aceitar — ações de jorgeluizdossantos

1. Entre no GitHub com a conta **jorgeluizdossantos**.
2. Abra o e-mail de convite enviado pelo GitHub e siga o link para visualizar
   o convite. Confira o proprietário e o nome do repositório.
3. Clique em **Accept invitation**.
4. Avise wxlv7h de que aceitou. O proprietário deve conferir a lista de
   colaboradores em Settings → Collaborators, agora sem convite pendente.

Se não receber o e-mail, confira spam e a conta utilizada. O proprietário pode
verificar o convite pendente e reenviá-lo, caso tenha expirado ou sido cancelado.

## 5. Conferir leitura e escrita

Primeiro, wxlv7h confirma que Jorge aparece como colaborador ativo.
Jorge pode verificar sua permissão usando GitHub CLI, se estiver instalado:

```powershell
gh auth status
# Se necessário, autentique a conta jorgeluizdossantos:
gh auth login -h github.com
# Ajuste o nome caso o proprietário tenha escolhido outro:
gh repo view wxlv7h/monitoramento-iot-temperatura-umidade --json nameWithOwner,viewerPermission
```

O campo `viewerPermission` esperado para Jorge é `WRITE`. Ver a página de um
repositório público, sozinha, não comprova permissão de escrita. Se um push
futuro for rejeitado, conferir conta autenticada e regras da branch antes de
alterar permissões. Não usar force push para contornar problemas.
[Referência do comando gh repo view](https://cli.github.com/manual/gh_repo_view).

## 6. Manter o projeto nos dois repositórios

O convite não copia arquivos nem sincroniza os dois repositórios automaticamente.
Após confirmar o convite e a URL do destino, a próxima tarefa será configurar
um segundo remote na pasta do projeto, preservando `origin` apontando para Jorge.
Não é necessário transferir a propriedade ou excluir o repositório atual.

Se o destino estiver vazio e o nome sugerido tiver sido confirmado, o procedimento
previsto para Jorge é:

```powershell
Set-Location D:\prj_react\40-monitor-temperatura\01-sistema-monitoramento
git remote -v
# Execute apenas se ainda não houver um remote chamado wxlv7h:
git remote add wxlv7h https://github.com/wxlv7h/monitoramento-iot-temperatura-umidade.git
git push wxlv7h main
```

Se já houver commits no destino, interrompa esse procedimento e compare os
históricos antes de publicar. Depois de configurado, cada novo commit precisará
ser enviado aos dois remotes (`git push origin main` e `git push wxlv7h main`).
Alterações feitas por outra pessoa precisam ser integradas antes do envio.
Somente arquivos versionados serão enviados; `.env` e credenciais ficam locais.

Estes comandos são instruções para a etapa posterior. Nenhum segundo remote,
convite ou envio ao repositório de wxlv7h foi realizado ao criar este roteiro.

## 7. Checklist de encerramento

- [ ] wxlv7h criou ou identificou o repositório correto e informou a URL.
- [ ] wxlv7h convidou jorgeluizdossantos nesse repositório.
- [ ] jorgeluizdossantos aceitou o convite com a conta correta.
- [ ] Leitura e escrita foram confirmadas.
- [ ] O segundo remote foi configurado sem alterar origin.
- [ ] O histórico do projeto foi enviado e conferido nos dois repositórios.

Se o repositório pertencer a uma **organização**, o procedimento de permissões
é diferente: quem tiver autorização administrativa deve conceder o papel
**Write**. Este roteiro foi escrito para um repositório da conta pessoal wxlv7h.
