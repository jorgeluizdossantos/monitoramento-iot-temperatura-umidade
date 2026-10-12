import * as argon2 from 'argon2';
import { accountSchema, parse } from './cadastro.validation';

export interface BootstrapRepository {
  createFirstSuperadmin(account: { nome: string; email: string; senha_hash: string }): Promise<number>;
}
export function createBootstrapService(repository: BootstrapRepository) {
  return async (input: unknown) => {
    const { senha, ...account } = parse(accountSchema, input);
    return repository.createFirstSuperadmin({ ...account, senha_hash: await argon2.hash(senha, { type: argon2.argon2id }) });
  };
}
