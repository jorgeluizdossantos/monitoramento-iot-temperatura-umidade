import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { backendRoot, loadEnvironment } from '../config/env';
import { mysqlOptions } from './mysql';
import { runtimeGrants, type RuntimeRole } from './runtime-grants';

async function main() {
  const env = loadEnvironment();
  // Arquivo separado e ignorado: a aplicação nunca carrega o administrador de provisionamento.
  const admin = dotenv.parse(fs.readFileSync(path.join(backendRoot, '.env.provision')));
  if (admin.DB_PROVISION_TARGET !== env.DB_TARGET || !admin.DB_PROVISION_USER || !admin.DB_PROVISION_PASSWORD) throw new Error('Confirme destino e administrador em .env.provision.');
  const role = process.argv[2] as RuntimeRole;
  if (!['api', 'maintenance', 'demo'].includes(role)) throw new Error('Informe api, maintenance ou demo.');
  const account = role === 'api' ? env.database : env.databaseRoles[role];
  if (!account) throw new Error('Configure a conta de destino no .env.');
  const grants = runtimeGrants(env.database.name, account.user, role);
  if (!/^[a-zA-Z0-9_-]{24,128}$/.test(account.password)) throw new Error('Use senha aleatória de 24–128 letras, números, hífen ou sublinhado para a conta nova.');
  const c = await mysql.createConnection({ ...mysqlOptions(env), user: admin.DB_PROVISION_USER, password: admin.DB_PROVISION_PASSWORD });
  try {
    // CREATE USER falha se a conta existe: nunca redefine senha ou amplia conta preexistente.
    await c.query(`CREATE USER '${account.user}'@'%' IDENTIFIED BY '${account.password}'${env.DB_TARGET === 'aiven' ? ' REQUIRE SSL' : ''}`);
    for (const statement of grants) await c.query(statement);
    console.log(`Conta ${role} provisionada no destino ${env.DB_TARGET}. Nenhuma credencial exibida.`);
  } finally { await c.end(); }
}
void main().catch(() => {
  console.error('Provisionamento não concluído. Confira destino, credenciais e privilégios do administrador. CREATE USER/GRANT não são transacionais; inspecione contas parciais antes de repetir. Nenhuma conta existente foi redefinida.');
  process.exitCode = 1;
});
