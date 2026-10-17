import { expect, test, type Page } from "@playwright/test";
const alert = {
  id: "9007199254740993",
  ambiente_id: 1,
  ambiente: "Bancada ESP32",
  dispositivo_id: 1,
  tipo: "temperatura",
  sentido: "acima",
  severidade: "critico",
  valor: "31.0",
  valor_extremo: "35.2",
  limite_violado: "30.0",
  ocorrido_em: "2026-10-17T10:00:00Z",
  encerrado_em: null,
  reconhecido_por: null,
  reconhecido_em: null,
};
async function setup(page: Page, profile = "leitor") {
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        usuario: {
          id: 1,
          empresa_id: 1,
          nome: "Teste",
          email: "teste@example.test",
          perfil: profile,
        },
      },
    }),
  );
  await page.route("**/api/v1/painel", (r) =>
    r.fulfill({ json: { dados: [] } }),
  );
  await page.route("**/api/v1/ambientes/*/leituras?*", (r) => {
    const pagina = Number(
      new URL(r.request().url()).searchParams.get("pagina"),
    );
    return r.fulfill({
      json: {
        dados: Array.from({ length: 20 }, (_, i) => ({
          id: String((pagina - 1) * 20 + i + 1),
          dispositivo_id: 1,
          medido_em: "2026-10-17T12:00:00Z",
          recebido_em: "2026-10-17T12:00:01Z",
          temperatura_c: "23.4",
          umidade_pct: "55.2",
        })),
        total: 100000,
        pagina,
        tamanho: 20,
      },
    });
  });
  await page.route("**/api/v1/ambientes/*/serie?*", (r) => {
    const start = Date.parse(
      new URL(r.request().url()).searchParams.get("de")!,
    );
    return r.fulfill({
      json: {
        fonte: "leituras_brutas_e_resumos",
        granularidade: "hora",
        dados: Array.from({ length: 24 }, (_, i) => ({
          hora_ref: new Date(start + i * 3600000).toISOString(),
          qtd_leituras: 10,
          temp_media: 23,
          temp_min: 20,
          temp_max: 29,
          umid_media: 50,
          umid_min: 40,
          umid_max: 60,
        })),
      },
    });
  });
  await page.route("**/api/v1/alertas?*", (r) =>
    r.fulfill({ json: { dados: [alert], total: 1, pagina: 1, tamanho: 20 } }),
  );
}
test("histórico pagina 100 mil sem renderizar todas as linhas e exporta CSV", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/ambientes/1/leituras.csv?*", (r) =>
    r.fulfill({
      contentType: "text/csv",
      body: "data_hora_utc,temperatura_c,umidade_pct\r\n2026-10-17T12:00:00Z,23.4,55.2\r\n",
    }),
  );
  await page.goto("/ambientes/1/historico");
  const readings = page
    .getByRole("heading", { name: "Leituras do período" })
    .locator("..");
  await expect(readings.locator("tbody tr")).toHaveCount(20);
  await expect(readings).toContainText("100.000 registros");
  await readings.getByRole("button", { name: "Próxima" }).click();
  await expect(readings).toContainText("Leitura #21");
  await page.getByLabel("Início (Bahia)").fill("2026-10-01T00:00");
  await page.getByLabel("Fim exclusivo (Bahia)").fill("2026-11-02T00:00");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page.getByRole("alert")).toContainText("31 dias");
  await page.getByLabel("Fim exclusivo (Bahia)").fill("2026-10-02T00:00");
  const request = page.waitForRequest(
    (r) => r.url().includes("/leituras?") && r.url().includes("2026-10-01T03"),
  );
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await request;
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await download).suggestedFilename()).toBe("ambiente-1-leituras.csv");
  await page.getByLabel("Visualização").selectOption("serie");
  await page.getByLabel("Início (Bahia)").fill("2026-01-01T00:00");
  await page.getByLabel("Fim exclusivo (Bahia)").fill("2026-06-01T00:00");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(
    page.getByRole("button", { name: "Exportar CSV" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Leituras do período" }),
  ).toHaveCount(0);
});
test("leitor consulta alertas sem botão de reconhecimento", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/alertas");
  await expect(page.getByRole("article")).toContainText("35,2");
  await expect(page.getByRole("article")).toContainText(alert.id);
  await expect(
    page.getByRole("button", { name: "Reconhecer alerta" }),
  ).toHaveCount(0);
  const filtered = page.waitForRequest((r) =>
    r.url().includes("situacao=encerrado"),
  );
  await page.getByLabel("Situação").selectOption("encerrado");
  await filtered;
});
test("operador confirma reconhecimento sem encerrar episódio", async ({
  page,
}) => {
  await setup(page, "operador");
  await page.route(`**/api/v1/alertas/${alert.id}/reconhecer`, async (r) => {
    expect(r.request().postDataJSON()).toEqual({});
    await page.route("**/api/v1/alertas?*", (rr) =>
      rr.fulfill({
        json: {
          dados: [
            {
              ...alert,
              reconhecido_por: 1,
              reconhecido_em: "2026-10-17T13:00:00Z",
            },
          ],
          total: 1,
          pagina: 1,
          tamanho: 20,
        },
      }),
    );
    return r.fulfill({
      json: {
        dados: {
          ...alert,
          reconhecido_por: 1,
          reconhecido_em: "2026-10-17T13:00:00Z",
        },
      },
    });
  });
  await page.goto("/alertas");
  await page.getByRole("button", { name: "Reconhecer alerta" }).click();
  await page.getByRole("button", { name: "Confirmar reconhecimento" }).click();
  await expect(page.getByRole("article")).toContainText("Reconhecido em");
  await expect(page.getByRole("article")).toContainText("Aberto");
});
test("CSV exibe falha e histórico trata acesso negado", async ({ page }) => {
  await setup(page);
  await page.route("**/api/v1/ambientes/1/leituras.csv?*", (r) =>
    r.fulfill({
      status: 503,
      json: {
        erro: {
          codigo: "FALHA",
          mensagem: "Exportação indisponível.",
          campos: [],
        },
      },
    }),
  );
  await page.goto("/ambientes/1/historico");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Exportação indisponível",
  );
  await page.route("**/api/v1/ambientes/*/leituras?*", (r) =>
    r.fulfill({
      status: 404,
      json: {
        erro: {
          codigo: "NAO_ENCONTRADO",
          mensagem: "Ambiente não encontrado.",
          campos: [],
        },
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Acesso não permitido" }),
  ).toBeVisible();
});
for (const width of [360, 1440])
  test(`histórico e alertas responsivos ${width}px`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ambientes/1/historico");
    await expect(page.getByRole("img").first()).toBeVisible();
    await expect(page.getByText("Leitura #1", { exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`history-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/alertas");
    await expect(page.getByRole("article")).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`alerts-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
