import type { Environment } from './env';

export type DatabaseRole = 'maintenance' | 'demo';
export function parseDatabaseRoles(input: NodeJS.ProcessEnv, target: 'local' | 'aiven', apiUser: string) {
  const prefix = target === 'aiven' ? 'DB_AIVEN_' : 'DB_LOCAL_';
  const roles: Partial<Record<DatabaseRole, { user: string; password: string }>> = {};
  for (const role of ['maintenance', 'demo'] as const) {
    const key = `${prefix}${role.toUpperCase()}_`;
    const user = input[`${key}USER`]?.trim(); const password = input[`${key}PASSWORD`];
    if (!!user !== !!password) throw new Error(`Preencha ${key}USER e ${key}PASSWORD juntos.`);
    if (user && password) roles[role] = { user, password };
  }
  const names = [apiUser, ...Object.values(roles).map(role => role.user)];
  if (new Set(names).size !== names.length) throw new Error('API, manutenção e demo exigem usuários de banco distintos.');
  return roles;
}
export function environmentForRole(env: Environment, role: DatabaseRole): Environment {
  const credentials = env.databaseRoles[role];
  if (!credentials) throw new Error(`Configure as credenciais de banco do papel ${role}.`);
  return { ...env, database: { ...env.database, ...credentials } };
}
