export type RuntimeRole = 'api' | 'maintenance' | 'demo';
const privileges: Record<RuntimeRole, Record<string, string>> = {
  api: {
    empresa: 'SELECT,INSERT,UPDATE', unidade: 'SELECT,INSERT,UPDATE', setor: 'SELECT,INSERT,UPDATE',
    ambiente: 'SELECT,INSERT,UPDATE', usuario: 'SELECT,INSERT,UPDATE', dispositivo: 'SELECT,INSERT,UPDATE',
    // UPDATE(id) permite SELECT FOR UPDATE no MySQL, sem liberar alteração dos valores históricos.
    dispositivo_pendente: 'SELECT,INSERT,UPDATE', leitura_telemetria: 'SELECT,INSERT,UPDATE(id)',
    alerta: 'SELECT,INSERT,UPDATE', evento_porta: 'SELECT,INSERT,UPDATE(id)', auditoria: 'SELECT,INSERT',
    sessao: 'SELECT,INSERT,UPDATE,DELETE', leitura_hora: 'SELECT', vw_ambiente_estado: 'SELECT',
  },
  maintenance: {
    empresa: 'SELECT,UPDATE(id)', dispositivo: 'SELECT,UPDATE', leitura_telemetria: 'SELECT,DELETE',
    ambiente: 'SELECT', leitura_hora: 'SELECT,INSERT,UPDATE', sessao: 'SELECT,DELETE',
  },
  demo: { empresa: 'SELECT', unidade: 'SELECT', setor: 'SELECT', ambiente: 'SELECT', vw_ambiente_estado: 'SELECT' },
};
export function runtimeGrants(database: string, user: string, role: RuntimeRole) {
  if (!/^[a-zA-Z0-9_]+$/.test(database) || !/^[a-zA-Z0-9_]{1,32}$/.test(user)) throw new Error('Identificador SQL inválido.');
  return Object.entries(privileges[role]).map(([table, grants]) => `GRANT ${grants} ON \`${database}\`.\`${table}\` TO '${user}'@'%'`);
}
