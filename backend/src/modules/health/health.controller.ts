import type { RequestHandler } from 'express';
import type { createHealthService } from './health.service';

export function createHealthController(service: ReturnType<typeof createHealthService>): RequestHandler {
  return (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    service.check().then(result => response.status(200).json(result)).catch(next);
  };
}
