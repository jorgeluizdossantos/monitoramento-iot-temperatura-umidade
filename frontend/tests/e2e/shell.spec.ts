import { expect, test } from '@playwright/test';
for (const width of [360, 768, 1440]) {
  test(`navegação acessível sem transbordamento em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Painel geral');
    await page.screenshot({ path: test.info().outputPath(`shell-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width < 1024) await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('link', { name: 'Central de alertas' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Central de alertas');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Central de alertas');
    if (width < 1024) await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
test('link de pular conteúdo e rota inexistente', async ({ page }) => {
  await page.goto('/endereco-inexistente');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Página não encontrada');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
});
