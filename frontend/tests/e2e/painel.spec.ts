import { expect, test, type Page } from "@playwright/test";
declare global {
  interface Window {
    __sseActive: number;
    __sseMax: number;
  }
}
const base = {
  empresa_id: 1,
  setor_id: 1,
  unidade_id: 1,
  unidade: "Salvador",
  setor: "Produção",
  status_conexao: "online",
  em_manutencao: 0,
  ultima_leitura_em: "2026-10-16T12:00:00Z",
  temperatura_c: "22.5",
  umidade_pct: "55.0",
  estado: "normal",
  temp_min_ideal: "10.0",
  temp_max_ideal: "30.0",
  umid_min_ideal: null,
  umid_max_ideal: null,
  temp_tolerancia: null,
  umid_tolerancia: null,
};
const initial = ["normal", "atencao", "critico", "sem_dados"].map(
  (estado, i) => ({
    ...base,
    estado,
    ambiente_id: i + 1,
    ambiente: `Sala ${i + 1}`,
    dispositivo_id: i + 1,
    device_id: `esp32-${i + 1}`,
    status_conexao: i === 3 ? "offline" : "online",
    unidade_id: i === 3 ? 2 : 1,
    unidade: i === 3 ? "Feira" : "Salvador",
  }),
);
async function setup(page: Page) {
  await page.route('**/api/v1/alertas?*', r => r.fulfill({json:{dados:[],total:0,pagina:1,tamanho:20}}));
  await page.route('**/api/v1/ambientes/*/serie?*', r => r.fulfill({json:{dados:[],fonte:'leituras_brutas_e_resumos',granularidade:'hora'}}));
  await page.addInitScript(() => {
    window.__sseActive = 0;
    window.__sseMax = 0;
    class Stream extends EventTarget {
      private ended = false;
      private update = () => this.dispatchEvent(new Event("atualizar"));
      private fail = () => this.dispatchEvent(new Event("error"));
      private open = () => this.dispatchEvent(new Event("open"));
      constructor() {
        super();
        window.__sseActive++;
        window.__sseMax = Math.max(window.__sseMax, window.__sseActive);
        window.addEventListener("test-update", this.update);
        window.addEventListener("test-fail", this.fail);
        window.addEventListener("test-open", this.open);
        queueMicrotask(() => {
          if (!this.ended) this.open();
        });
      }
      close() {
        if (this.ended) return;
        this.ended = true;
        window.__sseActive--;
        window.removeEventListener("test-update", this.update);
        window.removeEventListener("test-fail", this.fail);
        window.removeEventListener("test-open", this.open);
      }
    }
    Object.defineProperty(window, "EventSource", { value: Stream });
  });
  let rows = initial,
    status = 200,
    requests = 0;
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({
      json: {
        usuario: {
          id: 1,
          empresa_id: 1,
          nome: "Teste",
          email: "teste@example.com",
          perfil: "leitor",
        },
      },
    }),
  );
  await page.route("**/api/v1/painel", (r) => {
    requests++;
    return r.fulfill({
      status,
      json:
        status === 200
          ? { dados: rows }
          : {
              erro: {
                codigo: "INDISPONIVEL",
                mensagem: "Servidor indisponível.",
                campos: [],
              },
            },
    });
  });
  return {
    update: () => {
      rows = initial.map((r) =>
        r.ambiente_id === 1 ? { ...r, temperatura_c: "25.7" } : r,
      );
    },
    fail: () => {
      status = 503;
    },
    empty: () => {
      rows = [];
    },
    count: () => requests,
  };
}
test("estados, filtros e detalhe encerram conexão ao sair", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/painel");
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(
    page.getByRole("article", { name: "Ambiente Sala 4" }),
  ).not.toContainText("22,5");
  await expect(
    page.getByRole("article", { name: "Ambiente Sala 4" }),
  ).toContainText("Última leitura");
  await page.getByLabel("Unidade", { exact: true }).selectOption("2");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Estado", { exact: true }).selectOption("critico");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Detalhes do ambiente" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sala 3");
  expect(await page.evaluate(() => window.__sseMax)).toBe(1);
  await page.getByRole("link", { name: "Central de alertas" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Central de alertas",
  );
  await expect.poll(() => page.evaluate(() => window.__sseActive)).toBe(0);
});
test("SSE atualiza em menos de cinco segundos sem recarga", async ({
  page,
}) => {
  const api = await setup(page);
  await page.goto("/painel");
  const card = page.getByRole("article", { name: "Ambiente Sala 1" });
  await expect(card).toContainText("22,5");
  api.update();
  const start = Date.now();
  await page.evaluate(() => window.dispatchEvent(new Event("test-update")));
  await expect(card).toContainText("25,7", { timeout: 5000 });
  expect(Date.now() - start).toBeLessThan(5000);
});
test("queda usa polling e reconexão automática", async ({ page }) => {
  const api = await setup(page);
  await page.clock.install();
  await page.goto("/painel");
  await expect(page.getByText("Tempo real conectado")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("test-fail")));
  await page.clock.runFor(200);
  await expect(
    page.getByText("Reconectando · consulta a cada 30 s"),
  ).toBeVisible();
  const count = api.count();
  api.update();
  await page.clock.runFor(30200);
  await expect(
    page.getByRole("article", { name: "Ambiente Sala 1" }),
  ).toContainText("25,7");
  expect(api.count()).toBeGreaterThan(count);
  await page.evaluate(() => window.dispatchEvent(new Event("test-open")));
  await expect(page.getByText("Tempo real conectado")).toBeVisible();
});
test("erro preserva dados com aviso", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/painel");
  await expect(page.getByRole("article")).toHaveCount(4);
  api.fail();
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "podem estar desatualizados",
  );
  await expect(page.getByRole("article")).toHaveCount(4);
});
test("lista vazia explícita", async ({ page }) => {
  const api = await setup(page);
  api.empty();
  await page.goto("/painel");
  await expect(page.getByText("Nenhum ambiente encontrado")).toBeVisible();
});
for (const width of [360, 768, 1440])
  test(`painel responsivo ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/painel");
    await expect(page.getByRole("article")).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`painel-${width}.png`),
      fullPage: true,
    });
  });
