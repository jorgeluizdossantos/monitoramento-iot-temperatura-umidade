import pino from 'pino';
export function createLogger(level: string) {
  return pino({ level, redact: ['password', 'token', 'req.headers.authorization', 'req.headers.cookie'] });
}
