import type { Request, RequestHandler } from 'express';
import type { CadastroService } from './cadastro.service';
import type { Resource } from './cadastro.repository';
import { pageSchema, paramId, parse } from './cadastro.validation';

const context = (req: Request) => ({ actor: req.auth!, ip: req.ip ?? null });
export function createCadastroController(service: CadastroService, resource: Resource) {
  const list: RequestHandler = (req, res, next) => {
    void Promise.resolve().then(() => service.list(resource, req.auth!, parse(pageSchema, req.query))).then(result => res.json(result)).catch(next);
  };
  const get: RequestHandler = (req, res, next) => {
    void Promise.resolve().then(() => service.get(resource, parse(paramId, req.params.id), req.auth!)).then(result => res.json({ dados: result })).catch(next);
  };
  const create: RequestHandler = (req, res, next) => {
    void service.create(resource, req.body, context(req)).then(result => { res.location(`${req.baseUrl}/${result.id}`).status(201).json({ dados: result }); }).catch(next);
  };
  const update = (maintenance = false, deactivate = false): RequestHandler => (req, res, next) => {
    void Promise.resolve().then(() => service.update(resource, parse(paramId, req.params.id), deactivate ? { ativo: false } : req.body, context(req), maintenance)).then(result => res.json({ dados: result })).catch(next);
  };
  return { list, get, create, update };
}
