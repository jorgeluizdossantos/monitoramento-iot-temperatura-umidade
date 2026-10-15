# Acompanhamento solicitado pelo proprietário

- Atualização autorizada em 14/10/2026: iniciar o frontend gradualmente enquanto a Fase 7
  do backend permanece aberta. Seguir o plano `docs/03-implementacao/03-Plano de implementação do frontend Monitoramento IoT (STMA)-v01.md`.
  React 18/Vite/TypeScript/Tailwind substituem a reserva antiga de HTML puro.
  Registrar cada etapa em `docs/roteiro-frontend.md`. Não antecipar fases do frontend.
  Referência visual principal: `docs/02-projeto/02-prototipo-stitch/web`.
  Adaptar as telas desenhadas ao plano vigente; protótipos não ampliam o escopo funcional.

- Desde 12/10/2026, seguir `docs/03-implementacao/02-Plano de implementação do backend - STMA.md`.
  A instrução atual manda implementar o backend antes do frontend, sem ORM
  (mysql2 por repositórios; Prisma futuro), com MySQL local/Aiven configurável.
  Schema confirmado: `docs/03-implementacao/stma_schema.sql`, 13 tabelas.
  Registrar cada etapa didaticamente em `docs/roteiro-backend.md`.
  O plano antigo `docs/plano-de-implementacao.md` fica como histórico.
- Ao entregar trabalho, atualizar o plano com tarefas concluídas/parciais,
  evidências de validação, pendências e próximos passos. Não marcar preparação
  ou testes não executados como conclusão funcional.
- Informar sempre ao usuário o que foi feito, o que falta e o próximo passo.
- Não antecipar fases posteriores enquanto o aceite da fase atual estiver pendente.
- Quando alterar o plano histórico `docs/plano-de-implementacao.md`, sincronizá-lo com
  `../docs/03-implementacao/plano-de-implementacao.md` quando esse arquivo existir.
  Preservar `docs/referencias/plano-de-implementacao.md` como histórico v1.0.
