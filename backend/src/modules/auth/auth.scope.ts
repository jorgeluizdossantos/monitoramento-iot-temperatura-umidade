import { HttpError } from '../../shared/http-error';
import type { Principal } from './auth.repository';

export function companyId(principal?: Principal): number {
  if (!principal) throw new HttpError(401, 'NAO_AUTENTICADO', 'Autenticação necessária.');
  if (principal.empresa_id === null) throw new HttpError(403, 'ACESSO_NEGADO', 'Esta operação exige vínculo com uma empresa.');
  return principal.empresa_id;
}
