import { Router } from 'express';
import type { Environment } from '../../config/env';
import { mutationGuard } from '../../shared/mutation-guard';
import { requireRoles, requireSession } from '../auth/auth.middleware';
import type { AuthService } from '../auth/auth.service';
import type { CadastroService } from './cadastro.service';
import { createCadastroController } from './cadastro.controller';
import type { Resource } from './cadastro.repository';

const paths: Record<Resource, string> = { empresa: 'empresas', unidade: 'unidades', setor: 'setores', ambiente: 'ambientes', usuario: 'usuarios', dispositivo: 'dispositivos' };
export function createCadastroRouter(service: CadastroService, auth: AuthService, env: Environment) {
  const router = Router();
  for (const resource of Object.keys(paths) as Resource[]) {
    const routes = Router(); const controller = createCadastroController(service, resource);
    routes.use(requireSession(auth));
    routes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const read = resource === 'empresa' ? requireRoles('superadmin') : resource === 'usuario' ? requireRoles('administrador') : requireRoles('administrador', 'operador', 'leitor');
    const write = resource === 'empresa' ? requireRoles('superadmin') : requireRoles('administrador');
    const mutation = mutationGuard(env.PUBLIC_ORIGIN);
    routes.get('/', read, controller.list);
    routes.get('/:id', read, controller.get);
    routes.post('/', write, mutation, controller.create);
    routes.patch('/:id', write, mutation, controller.update());
    // Compatibilidade com o critério do plano: DELETE é apenas desativação, sem SQL DELETE.
    routes.delete('/:id', write, mutation, controller.update(false, true));
    if (resource === 'dispositivo') routes.patch('/:id/manutencao', requireRoles('administrador', 'operador'), mutation, controller.update(true));
    router.use(`/${paths[resource]}`, routes);
  }
  return router;
}
