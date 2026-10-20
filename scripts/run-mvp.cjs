const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const backend = path.resolve(__dirname, '../backend');
if (!fs.existsSync(path.join(backend, '.env.mvp'))) {
  console.error('Crie backend/.env.mvp a partir de .env.mvp.example. Credenciais permanecem no .env.');
  process.exit(1);
}
// Perfil explícito preserva a configuração local e não modifica o ambiente de produção.
const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
  cwd: backend, stdio: 'inherit', env: { ...process.env, NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? '1', STMA_ENV_FILE: '.env.mvp' },
});
child.on('error', () => { console.error('Falha ao iniciar backend MVP.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
