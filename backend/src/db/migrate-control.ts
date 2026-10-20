import fs from 'node:fs';
import path from 'node:path';
import { backendRoot, loadEnvironment } from '../config/env';
import { createDatabase } from './mysql';
async function main() {
  const db = createDatabase(loadEnvironment());
  try { await db.withConnection(async c => {
    const [rows] = await c.query<import('mysql2/promise').RowDataPacket[]>("SELECT COLUMN_NAME name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='dispositivo' AND COLUMN_NAME IN ('led_aceso','limite_led','controle_recebido_em','controle_comando_id')");
    if (rows.length === 4) { console.log('Extensão 002 já aplicada.'); return; }
    if (rows.length) throw new Error('Schema parcial: conferir manualmente.');
    await c.query(fs.readFileSync(path.join(backendRoot, 'migrations/002_device_control.sql'), 'utf8'));
    console.log('Extensão 002 aplicada.');
  }); } finally { await db.close(); }
}
void main().catch(() => { console.error('Falha na extensão 002. Confira conexão/permissões; nenhum dado foi removido.'); process.exitCode = 1; });
