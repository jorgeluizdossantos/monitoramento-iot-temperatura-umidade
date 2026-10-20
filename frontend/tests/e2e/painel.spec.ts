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
  await page.route('**/api/v1/dispositivos/*/controle', r => r.fulfill({json:{dados:{led:false,limite:null,recebido_em:new Date().toISOString(),comando_id:null}}}));
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
test('operador aguarda confirmação física; automático bloqueia comando manual', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/auth/me', r => r.fulfill({json:{usuario:{id:1,empresa_id:1,nome:'Operador',email:'operador@example.test',perfil:'operador'}}}));
  const commandId = 'cc5bd922-12b0-4114-90ae-de0a1d128cb4';
  let confirmed = false;
  await page.route('**/api/v1/dispositivos/1/controle', r => {
    if (r.request().method() === 'POST') {
      expect(r.request().postDataJSON()).toEqual({tipo:'limite',valor:28});
      return r.fulfill({status:202,json:{comando_id:commandId}});
    }
    return r.fulfill({json:{dados:{led:confirmed,limite:confirmed?28:null,recebido_em:new Date().toISOString(),comando_id:confirmed?commandId:null}}});
  });
  await page.goto('/painel');
  await page.getByRole('article', {name:'Ambiente Sala 1'}).getByRole('link', {name:'Detalhes do ambiente'}).click();
  await page.getByRole('button', {name:'Aplicar limite do LED'}).click();
  await expect(page.getByText('Enviado ao broker. Aguardando confirmação do ESP32…')).toBeVisible();
  await expect(page.getByRole('button', {name:'Aplicar limite do LED'})).toBeDisabled();
  confirmed = true;
  await expect(page.getByText('Comando confirmado pelo ESP32.')).toBeVisible({timeout:10000});
  await expect(page.getByRole('button', {name:'Apagar LED'})).toBeDisabled();
  await expect(page.getByRole('button', {name:'Desativar automático'})).toBeEnabled();
});
test('leitor consulta controle sem ações e operador não comanda estado antigo', async ({ page }) => {
  await setup(page);
  await page.goto('/painel');
  await page.getByRole('article', {name:'Ambiente Sala 1'}).getByRole('link', {name:'Detalhes do ambiente'}).click();
  await expect(page.getByRole('heading', {name:/LED e controle automático/})).toBeVisible();
  await expect(page.getByRole('button', {name:'Acender LED'})).toHaveCount(0);
  await page.route('**/api/v1/auth/me', r => r.fulfill({json:{usuario:{id:1,empresa_id:1,nome:'Operador',email:'operador@example.test',perfil:'operador'}}}));
  await page.route('**/api/v1/dispositivos/1/controle', r => r.fulfill({json:{dados:{led:false,limite:null,recebido_em:'2020-01-01T00:00:00Z',comando_id:null}}}));
  await page.reload();
  await expect(page.getByRole('button', {name:'Acender LED'})).toBeDisabled();
  await expect(page.getByRole('button', {name:'Aplicar limite do LED'})).toBeDisabled();
});
test('primeira hora de telemetria aparece como ponto no gráfico', async ({ page }) => {
  await setup(page);
  const hour = new Date(); hour.setUTCMinutes(0,0,0);
  await page.route('**/api/v1/ambientes/1/serie?*', r => r.fulfill({json:{fonte:'leituras_brutas_e_resumos',granularidade:'hora',dados:[{hora_ref:hour.toISOString(),qtd_leituras:4,temp_media:29,temp_min:28,temp_max:30,umid_media:60,umid_min:59,umid_max:61}]}}));
  await page.goto('/painel');
  await page.getByRole('article', {name:'Ambiente Sala 1'}).getByRole('link', {name:'Detalhes do ambiente'}).click();
  await expect(page.locator('.recharts-line-dot').first()).toBeVisible();
});
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
  if ((page.viewportSize()?.width ?? 1280) < 1024) await page.getByRole("button", { name: "Abrir menu" }).click();
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
