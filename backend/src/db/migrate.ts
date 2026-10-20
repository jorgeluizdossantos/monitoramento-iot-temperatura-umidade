import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { backendRoot, loadEnvironment } from '../config/env';
import { mysqlOptions } from './mysql';

// Bootstrap 001: SQL de origem preservado; apenas seleção do banco vem do .env.
async function migrate() {
  const env = loadEnvironment();
  const options = mysqlOptions(env);
  const connection = await mysql.createConnection({ ...options, database: undefined, multipleStatements: true });
  try {
    const [versions] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version');
    const version = String(versions[0].version);
    const [major, minor, patch] = version.split('.').map(Number);
    if (version.includes('MariaDB') || major < 8 || (major === 8 && minor === 0 && patch < 16)) throw new Error('MYSQL_VERSION');
    // name foi validado como [a-zA-Z0-9_]+; identificadores não aceitam placeholder ?.
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await connection.changeUser({ database: env.database.name });
    await connection.query("SET time_zone = '+00:00'");
    const [tables] = await connection.query<RowDataPacket[]>('SHOW FULL TABLES');
    if (tables.length) throw new Error('DATABASE_NOT_EMPTY');
    const sql = fs.readFileSync(path.join(backendRoot, 'migrations/001_stma_schema.sql'), 'utf8')
      .replace(/CREATE DATABASE IF NOT EXISTS stma_db[\s\S]*?;\s*USE stma_db;/, '');
    await connection.query(sql);
    await connection.query(fs.readFileSync(path.join(backendRoot, 'migrations/002_device_control.sql'), 'utf8'));
    console.log('Migrações 001 e 002 aplicadas: schema STMA e estado de controle. Nenhum seed foi inserido.');
  } finally { await connection.end(); }
}

void migrate().catch(error => {
  const driverCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const code = error instanceof Error && ['DATABASE_NOT_EMPTY', 'MYSQL_VERSION'].includes(error.message) ? error.message
    : /^[A-Z_]+$/.test(driverCode) ? driverCode : 'MIGRATION_FAILED';
  console.error(`${code}: confira configuração/permissões. DDL não é transacional; não reaplique sobre schema parcial e não apague dados automaticamente.`);
  process.exitCode = 1;
});
