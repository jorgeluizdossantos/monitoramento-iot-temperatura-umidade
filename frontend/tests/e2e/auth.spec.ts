import { expect, test, type Page } from '@playwright/test';
const principal = (perfil = 'leitor') => ({ id: 1, empresa_id: perfil === 'superadmin' ? null : 1, nome: 'Pessoa de teste', email: 'teste@example.com', perfil });
const unauthorized = { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão ausente, inválida ou expirada.', campos: [] } };
async function setup(page: Page, profile = 'leitor', authenticated = false) {
  let active = authenticated;
  await page.route('**/api/v1/alertas?*', r => r.fulfill({json:{dados:[],total:0,pagina:1,tamanho:20}}));
  await page.route('**/api/v1/ambientes/*/leituras?*', r => r.fulfill({json:{dados:[],total:0,pagina:1,tamanho:20}}));
  await page.route('**/api/v1/ambientes/*/serie?*', r => r.fulfill({json:{dados:[],fonte:'leituras_brutas_e_resumos',granularidade:'hora'}}));
  await page.route('**/api/v1/painel', r => r.fulfill({json:{dados:[]}}));
  await page.route('**/api/v1/stream', r => r.fulfill({status:503,body:''}));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: active ? 200 : 401, json: active ? { usuario: principal(profile) } : unauthorized }));
  await page.route('**/api/v1/auth/login', async route => { active = true; await route.fulfill({ json: { usuario: principal(profile) } }); });
  await page.route('**/api/v1/auth/logout', async route => { active = false; await route.fulfill({ status: 204 }); });
  return { expire: () => { active = false; } };
}
async function enter(page: Page) {
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
test('leitor entra, preserva destino, restaura sessão e sai', async ({ page }) => {
  await setup(page);
  await page.goto('/ambientes/25/historico?periodo=dia');
  await expect(page).toHaveURL(/entrar$/);
  await enter(page);
  await expect(page).toHaveURL(/ambientes\/25\/historico\?periodo=dia$/);
  await expect(page.getByRole('link', { name: 'Cadastros', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Histórico · Ambiente 25');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/entrar$/);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test('leitor não abre cadastro por endereço direto', async ({ page }) => {
  await setup(page, 'leitor', true);
  await page.goto('/cadastros/usuarios');
  await expect(page.getByRole('heading', { name: 'Acesso não permitido' })).toBeVisible();
});
test('administrador vê cadastros mas não adota placas', async ({ page }) => {
  await setup(page, 'administrador', true);
  await page.goto('/painel');
  await expect(page.getByRole('link', { name: 'Cadastros', exact: true })).toBeVisible();
  await page.goto('/cadastros/pendentes');
  await expect(page.getByRole('heading', { name: 'Acesso não permitido' })).toBeVisible();
});
test('superadmin recebe empresas e pendentes, sem painel empresarial', async ({ page }) => {
  await setup(page, 'superadmin');
  await page.goto('/entrar'); await enter(page);
  await expect(page).toHaveURL(/cadastros\/empresas$/);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Placas pendentes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Painel geral' })).toHaveCount(0);
  await page.goto('/painel');
  await expect(page.getByRole('heading', { name: 'Acesso não permitido' })).toBeVisible();
});
test('sessão expirada volta ao login mantendo destino', async ({ page }) => {
  const session = await setup(page, 'operador', true);
  await page.goto('/alertas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Central de alertas');
  session.expire();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/entrar$/);
  await enter(page);
  await expect(page).toHaveURL(/alertas$/);
});
test('validação, senha visível e erro de credenciais acessível', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/auth/login', route => route.fulfill({ status: 401, json: { erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail ou senha inválidos.', campos: [] } } }));
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Informe sua senha.')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await enter(page);
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos.');
});
test('falha na sessão mostra tentativa novamente, sem presumir logout', async ({ page }) => {
  await page.route('**/api/v1/painel', r => r.fulfill({json:{dados:[]}}));
  await page.route('**/api/v1/stream', r => r.fulfill({status:503,body:''}));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/painel');
  await expect(page.getByRole('heading', { name: 'Não foi possível verificar o acesso' })).toBeVisible();
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { usuario: principal() } }));
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Painel geral' })).toBeVisible();
});
for (const width of [360, 1440]) test(`login responsivo ${width}px`, async ({ page }) => {
  await setup(page); await page.setViewportSize({ width, height: 900 }); await page.goto('/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar no STMA' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`login-${width}.png`), fullPage: true });
});
