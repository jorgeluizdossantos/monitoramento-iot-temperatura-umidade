import { z } from 'zod';
import { parse } from '../cadastros/cadastro.validation';
import type { DemoRepository } from './demo.repository';

export function createDemoService(repository: DemoRepository) {
  return {
    async panel(query: unknown) {
      // O visitante não escolhe empresa, dispositivo, campos ou ordenação.
      parse(z.object({}).strict(), query);
      return { demonstracao: true, dados: await repository.panel() };
    },
  };
}
export type DemoService = ReturnType<typeof createDemoService>;
