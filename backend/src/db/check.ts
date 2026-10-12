import type { RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../config/env';
import { createDatabase } from './mysql';

async function check() {
  const env = loadEnvironment();
  const database = createDatabase(env);
  try {
    await database.withConnection(async connection => {
      const [tables] = await connection.execute<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'", [env.database.name]);
      const expected = ['empresa', 'unidade', 'setor', 'ambiente', 'dispositivo', 'usuario', 'sessao', 'leitura_telemetria', 'alerta', 'leitura_hora', 'evento_porta', 'dispositivo_pendente', 'auditoria'];
      if (tables.length !== expected.length || expected.some(name => !tables.some(t => t.name === name))) throw new Error('Schema incompleto.');
      const [[session]] = await connection.query<RowDataPacket[]>('SELECT @@session.time_zone AS timezone');
      if (session.timezone !== '+00:00') throw new Error('Fuso inválido.');
      const [[tls]] = await connection.query<RowDataPacket[]>("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      if (env.DB_TARGET === 'aiven' && !tls.Value) throw new Error('TLS obrigatório.');
      await connection.query('SELECT * FROM vw_ambiente_estado LIMIT 0');
      console.log(`Banco ${env.DB_TARGET}: 13 tabelas, view e UTC confirmados; TLS ${tls.Value ? 'ativo' : 'não exigido no contêiner local'}.`);
    });
  } finally { await database.close(); }
}

void check().catch(() => { console.error('Falha na verificação: confira configuração, certificado, conexão e schema.'); process.exitCode = 1; });
