import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { backendRoot, loadEnvironment } from '../config/env';
import { createDatabase } from './mysql';
import { createBootstrapService } from '../modules/cadastros/bootstrap.service';
import { createMysqlBootstrapRepository } from '../modules/cadastros/mysql-cadastro.repository';
import { HttpError } from '../shared/http-error';

async function main() {
  const file = path.join(backendRoot, '.env');
  const local = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  const settings = { ...local, ...process.env };
  const env = loadEnvironment();
  const db = createDatabase(env);
  try {
    const id = await createBootstrapService(createMysqlBootstrapRepository(db))({ nome: settings.BOOTSTRAP_NAME, email: settings.BOOTSTRAP_EMAIL, senha: settings.BOOTSTRAP_PASSWORD });
    console.log(JSON.stringify({ status: 'created', databaseTarget: env.DB_TARGET, usuarioId: id }));
  } finally { await db.close(); }
}
void main().catch(error => {
  console.error(error instanceof HttpError ? `${error.codigo}: ${error.message}` : 'Falha no provisionamento. Confira configuração e conexão.');
  process.exitCode = 1;
});
