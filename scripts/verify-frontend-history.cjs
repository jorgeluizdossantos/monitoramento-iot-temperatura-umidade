// Prova local da Fase 5: MySQL real, API e navegador; só remove fixtures criadas aqui.
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const backend = p => require(path.join(root, 'backend/dist', p));
const express = require('../backend/node_modules/express');
const { chromium, expect } = require('../frontend/node_modules/@playwright/test');
process.env.NODE_ENV = 'test'; process.env.DB_TARGET = 'local';
const { loadEnvironment } = backend('config/env');
const { createDatabase } = backend('db/mysql');
const { createApp } = backend('app');
const { createLogger } = backend('shared/logger');
const { createAuthService, hashToken } = backend('modules/auth/auth.service');
const { createMysqlAuthRepository } = backend('modules/auth/mysql-auth.repository');
const { createMonitoringService } = backend('modules/telemetria/monitoring.service');
const { createMysqlMonitoringRepository } = backend('modules/telemetria/mysql-monitoring.repository');
const { createHistoryService } = backend('modules/telemetria/history.service');
const { createMysqlHistoryRepository } = backend('modules/telemetria/mysql-history.repository');
(async () => {
  const env = { ...loadEnvironment(), PUBLIC_ORIGIN: 'http://127.0.0.1:5174', SESSION_COOKIE_SECURE: false };
  if (env.DB_TARGET !== 'local') throw new Error('Exige MySQL local.');
  const db = createDatabase(env), sql = (text, args = []) => db.withConnection(c => c.execute(text, args));
  const add = async (text, args) => (await sql(text, args))[0].insertId;
  const suffix = randomUUID(), token = randomBytes(32).toString('hex');
  let company, room, server, browser;
  try {
    company = await add('INSERT INTO empresa(nome) VALUES (?)', [`fixture-f5-${suffix}`]);
    const unit = await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)', [company, 'Unidade de teste']);
    const sector = await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)', [company, unit, 'Setor']);
    room = await add('INSERT INTO ambiente(empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal) VALUES (?,?,?,18,26)', [company, sector, 'Sala E2E F5']);
    const device = await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,'DHT11')", [company, room, `f5-${suffix}`]);
    const user = await add("INSERT INTO usuario(empresa_id,nome,email,senha_hash,perfil) VALUES (?,?,?,'unused-test-hash','operador')", [company, 'Operador E2E', `${suffix}@example.test`]);
    await sql('INSERT INTO sessao(usuario_id,token_hash,expira_em) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 HOUR))', [user, hashToken(token)]);
    const digits = '(SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
    await sql(`INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em) SELECT ?,?,20,50,TIMESTAMPADD(SECOND,a.n+10*b.n+100*c.n+1000*d.n+10000*e.n,'2026-10-01 03:00:00') FROM ${digits} a CROSS JOIN ${digits} b CROSS JOIN ${digits} c CROSS JOIN ${digits} d CROSS JOIN ${digits} e`, [device, room]);
    const alert = await add("INSERT INTO alerta(ambiente_id,dispositivo_id,tipo,sentido,severidade,valor,valor_extremo,limite_violado,ocorrido_em) VALUES (?,?,'temperatura','acima','critico',29,31,26,UTC_TIMESTAMP(3))", [room, device]);
    const auth = await createAuthService(createMysqlAuthRepository(db), 8);
    const app = createApp({ healthRepository: { ping: async () => {} }, logger: createLogger('silent'), auth: { service: auth, env }, monitoring: createMonitoringService(createMysqlMonitoringRepository(db)), history: createHistoryService(createMysqlHistoryRepository(db)) });
    const web = express(); web.use(express.static(path.join(root, 'frontend/dist')));
    web.get(['/ambientes/:id/historico', '/alertas', '/entrar'], (_req, res) => res.sendFile(path.join(root, 'frontend/dist/index.html'))); web.use(app);
    server = web.listen(5174, '127.0.0.1'); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    const context = await browser.newContext(); await context.addCookies([{ name: 'stma_session', value: token, url: env.PUBLIC_ORIGIN, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.goto(`${env.PUBLIC_ORIGIN}/ambientes/${room}/historico`);
    await page.getByLabel('Início (Bahia)').fill('2026-10-01T00:00'); await page.getByLabel('Fim exclusivo (Bahia)').fill('2026-10-03T00:00');
    const start = Date.now(); await page.getByRole('button', { name: 'Aplicar período' }).click();
    const readings = page.getByRole('heading', { name: 'Leituras do período' }).locator('..');
    await expect(readings).toContainText('100.000 registros', { timeout: 10000 });
    const firstPageMs = Date.now() - start;
    await expect(readings.locator('tbody tr')).toHaveCount(20);
    await readings.getByRole('button', { name: 'Próxima' }).click(); await expect(readings).toContainText('Página 2 de 5000');
    await expect(page.getByRole('img').first()).toBeVisible();
    const pendingDownload = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const download = await pendingDownload; assert.equal(await download.failure(), null);
    const text = await fs.readFile(await download.path(), 'utf8');
    assert.equal(text.split('\r\n').filter(Boolean).length, 100001);
    assert(text.startsWith('data_hora_utc,temperatura_c,umidade_pct,dispositivo_id,leitura_id'));
    await page.goto(`${env.PUBLIC_ORIGIN}/alertas`);
    await page.getByRole('button', { name: 'Reconhecer alerta' }).click(); await page.getByRole('button', { name: 'Confirmar reconhecimento' }).click();
    await expect(page.getByRole('article')).toContainText('Reconhecido em');
    const [[row]] = await sql('SELECT reconhecido_por,encerrado_em FROM alerta WHERE id=?', [alert]);
    assert.equal(row.reconhecido_por, user); assert.equal(row.encerrado_em, null);
    console.log(JSON.stringify({ resultado: 'PASS', leituras: 100000, linhasRenderizadas: 20, primeiraPaginaMs: firstPageMs, linhasCsv: 100001, reconhecimentoPersistido: true }));
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    if (company) {
      await sql('DELETE FROM auditoria WHERE empresa_id=?', [company]);
      await sql('DELETE s FROM sessao s JOIN usuario u ON u.id=s.usuario_id WHERE u.empresa_id=?', [company]);
      if (room) { await sql('DELETE FROM alerta WHERE ambiente_id=?', [room]); await sql('DELETE FROM leitura_telemetria WHERE ambiente_id=?', [room]); }
      for (const table of ['dispositivo', 'ambiente', 'setor', 'unidade', 'usuario']) await sql(`DELETE FROM ${table} WHERE empresa_id=?`, [company]);
      await sql('DELETE FROM empresa WHERE id=?', [company]);
    }
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
