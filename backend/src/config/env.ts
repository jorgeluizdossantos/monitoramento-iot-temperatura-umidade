import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

export const backendRoot = path.resolve(__dirname, '../..');
const positiveInteger = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

export function parseEnvironment(env: NodeJS.ProcessEnv) {
  const common = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInteger(3000, 65535),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DB_TARGET: z.enum(['local', 'aiven']).default('local'),
    DB_POOL_LIMIT: positiveInteger(5, 50),
    DB_CONNECT_TIMEOUT_MS: positiveInteger(5000, 30000),
    SESSION_TTL_HOURS: positiveInteger(8, 168),
    SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
    PUBLIC_ORIGIN: z.string().url().default('http://localhost:3000'),
    AUTH_IP_LIMIT: positiveInteger(20, 1000),
    AUTH_EMAIL_LIMIT: positiveInteger(5, 100),
  }).safeParse(env);
  if (!common.success) throw new Error(`Configuração inválida: ${common.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const prefix = common.data.DB_TARGET === 'aiven' ? 'DB_AIVEN_' : 'DB_LOCAL_';
  const database = z.object({
    host: z.string().trim().min(1),
    port: z.coerce.number().int().min(1).max(65535),
    name: z.string().regex(/^[a-zA-Z0-9_]+$/),
    user: z.string().trim().min(1),
    password: z.string().min(1),
  }).safeParse({
    host: env[`${prefix}HOST`], port: env[`${prefix}PORT`], name: env[`${prefix}NAME`],
    user: env[`${prefix}USER`], password: env[`${prefix}PASSWORD`],
  });
  if (!database.success) throw new Error(`Configuração inválida: ${database.error.issues.map(i => prefix + String(i.path[0]).toUpperCase()).join(', ')}`);
  if (common.data.DB_TARGET === 'aiven' && !env.DB_AIVEN_CA_FILE?.trim()) throw new Error('Preencha DB_AIVEN_CA_FILE.');
  if (common.data.NODE_ENV === 'production' && common.data.DB_TARGET !== 'aiven') {
    throw new Error('Nesta versão, produção exige DB_TARGET=aiven com TLS.');
  }
  const origin = new URL(common.data.PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== common.data.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN deve conter somente a origem HTTP(S), sem caminho.');
  if (common.data.NODE_ENV === 'production' && (!common.data.SESSION_COOKIE_SECURE || origin.protocol !== 'https:')) throw new Error('Produção exige cookie Secure e PUBLIC_ORIGIN HTTPS.');
  return {
    ...common.data, database: {
      ...database.data,
      caFile: common.data.DB_TARGET === 'aiven' ? env.DB_AIVEN_CA_FILE : undefined,
    },
  };
}

export type Environment = ReturnType<typeof parseEnvironment>;

export function loadEnvironment() {
  const file = path.join(backendRoot, '.env');
  const local = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  return parseEnvironment({ ...local, ...process.env });
}
