import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { backendRoot, loadEnvironment } from '../config/env';
import { mysqlOptions } from './mysql';

async function main() {
  const env = loadEnvironment();
  if (process.argv[2] !== `--target=${env.DB_TARGET}`) throw new Error('Informe o destino explicitamente.');
  const c = await mysql.createConnection({ ...mysqlOptions(env), multipleStatements: true });
  let locked = false;
  try {
    await c.query("SET time_zone='+00:00'");
    const [[lock]] = await c.execute<RowDataPacket[]>('SELECT GET_LOCK(?,0) ok',[`stma:seed:${env.database.name}`.slice(0,64)]);
    if (Number(lock.ok) !== 1) throw new Error('Seed em andamento.'); locked = true;
    await c.beginTransaction();
    const [[existing]] = await c.execute<RowDataPacket[]>(`SELECT e.eh_demo FROM dispositivo d JOIN empresa e ON e.id=d.empresa_id WHERE d.device_id='stma-demo-simulado-001'`);
    if (existing) {
      if (!existing.eh_demo) throw new Error('Identificador reservado usado por empresa real.');
      await c.commit(); console.log('Demonstração já existe; nenhum dado foi modificado.'); return;
    }
    await c.query(fs.readFileSync(path.join(backendRoot,'seeds/stma_seed_demo.sql'),'utf8'));
    await c.commit(); console.log('Demonstração fictícia criada. Não inclui usuário, senha nem dispositivo físico.');
  } catch (error) { await c.rollback(); throw error; }
  finally { if (locked) await c.execute('SELECT RELEASE_LOCK(?)',[`stma:seed:${env.database.name}`.slice(0,64)]); await c.end(); }
}
void main().catch(() => { console.error('Seed não concluído; confira destino, permissões e identificador reservado.'); process.exitCode=1; });
