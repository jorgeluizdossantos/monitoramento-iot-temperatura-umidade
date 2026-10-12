import fs from 'node:fs';
import path from 'node:path';
import mysql, { type PoolConnection, type PoolOptions } from 'mysql2/promise';
import { backendRoot, type Environment } from '../config/env';

export function mysqlOptions(env: Environment): PoolOptions {
  return {
    host: env.database.host, port: env.database.port, database: env.database.name,
    user: env.database.user, password: env.database.password,
    connectionLimit: env.DB_POOL_LIMIT, connectTimeout: env.DB_CONNECT_TIMEOUT_MS,
    waitForConnections: true, queueLimit: 20,
    timezone: 'Z', charset: 'utf8mb4', supportBigNumbers: true, bigNumberStrings: true,
    multipleStatements: false,
    ...(env.database.caFile ? { ssl: {
      ca: fs.readFileSync(path.resolve(backendRoot, env.database.caFile)),
      rejectUnauthorized: true, verifyIdentity: true,
    } } : {}),
  };
}

// Este adaptador é o único ponto que conhece o pool do driver.
export function createDatabase(env: Environment) {
  const pool = mysql.createPool(mysqlOptions(env));
  return {
    async withConnection<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
      const connection = await pool.getConnection();
      try {
        // timezone:'Z' converte valores no cliente; SET também fixa os DEFAULTs do servidor.
        await connection.query("SET time_zone = '+00:00'");
        return await work(connection);
      } finally { connection.release(); }
    },
    close: () => pool.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>;
