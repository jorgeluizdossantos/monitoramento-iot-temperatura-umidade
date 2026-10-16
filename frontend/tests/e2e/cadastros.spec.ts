import { expect, test, type Page } from "@playwright/test";
const samples: Record<string, Record<string, unknown>> = {
  empresas: { nome: "Empresa", cnpj: null },
  unidades: { nome: "Unidade", endereco: null, fuso_horario: "America/Bahia" },
  setores: { nome: "Setor", unidade_id: 1, descricao: null },
  ambientes: {
    nome: "Ambiente",
    setor_id: 1,
    descricao: null,
    temp_min_ideal: 10,
    temp_max_ideal: 30,
    umid_min_ideal: null,
    umid_max_ideal: null,
    temp_tolerancia: null,
    umid_tolerancia: null,
  },
  dispositivos: {
    nome: "Placa",
    device_id: "esp32-test",
    ambiente_id: 1,
    modelo_placa: "ESP32",
    sensor: "DHT11",
    intervalo_leitura_seg: 30,
    offline_apos_seg: 120,
    em_manutencao: false,
  },
  usuarios: { nome: "Pessoa", email: "pessoa@example.com", perfil: "leitor" },
};
async function setup(page: Page, entity: string) {
  let rows = [{ id: 1, ativo: true, ...samples[entity] }];
  const writes: unknown[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/", "");
    const method = route.request().method();
    if (path === "auth/me")
      return route.fulfill({
        json: {
          usuario: {
            id: 9,
            empresa_id: entity === "empresas" ? null : 1,
            nome: "Admin",
            email: "admin@example.com",
            perfil: entity === "empresas" ? "superadmin" : "administrador",
          },
        },
      });
    if (method !== "GET") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (method === "POST") rows.push({ id: 2, ativo: true, ...body });
      else
        rows = rows.map((r) =>
          r.id === 1
            ? {
                ...r,
                ...body,
                ...(method === "DELETE" ? { ativo: false } : {}),
              }
            : r,
        );
      return route.fulfill({
        status: method === "POST" ? 201 : 200,
        json: { dados: rows[method === "POST" ? rows.length - 1 : 0] },
      });
    }
    const [resource, id] = path.split("/");
    if (id)
      return route.fulfill({
        json: {
          dados:
            resource === entity
              ? rows[0]
              : { id: 1, ativo: true, ...samples[resource] },
        },
      });
    return route.fulfill({
      json: {
        dados:
          resource === entity
            ? rows
            : [{ id: 1, ativo: true, ...samples[resource] }],
        total: resource === entity ? rows.length : 1,
        pagina: 1,
        tamanho: 20,
      },
    });
  });
  return writes;
}
for (const entity of Object.keys(samples))
  test(`${entity}: criar, editar e confirmar desativação`, async ({ page }) => {
    const writes = await setup(page, entity);
    await page.goto(`/cadastros/${entity}`);
    await page.getByRole("button", { name: /^Cadastrar / }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Novo cadastro");
    if (entity === "empresas") {
      await page
        .getByLabel("Nome do administrador inicial")
        .fill("Administrador");
      await page
        .getByLabel("E-mail do administrador inicial")
        .fill("novo@example.com");
      await page
        .getByLabel("Senha do administrador inicial")
        .fill("senha-longa-123");
    }
    if (entity === "setores")
      await page.getByLabel("Unidade", { exact: true }).selectOption("1");
    if (entity === "ambientes")
      await page.getByLabel("Setor", { exact: true }).selectOption("1");
    if (entity === "dispositivos") {
      await page.getByLabel("Ambiente", { exact: true }).selectOption("1");
      await page.getByLabel("Identificador MQTT").fill("esp32-new");
    }
    if (entity === "usuarios") {
      await page.getByLabel("E-mail", { exact: true }).fill("novo@example.com");
      await page.getByLabel("Senha", { exact: true }).fill("senha-longa-123");
    }
    await page.getByRole("button", { name: "Salvar cadastro" }).click();
    await expect(
      page.getByText("Cadastro criado.", { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    await page
      .getByRole("button", { name: "Editar cadastro 1", exact: true })
      .click();
    await page.getByLabel("Nome", { exact: true }).fill("Alterado");
    await page.getByRole("button", { name: "Salvar cadastro" }).click();
    await expect(
      page.getByText("Cadastro atualizado.", { exact: true }),
    ).toBeVisible();
    expect(writes[1]).toEqual({ nome: "Alterado" });
    await page
      .getByRole("button", { name: "Desativar cadastro 1", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(writes).toHaveLength(2);
    await page
      .getByRole("button", { name: "Desativar cadastro 1", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(
      page.getByText("Situação do cadastro atualizada.", { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(3);
  });
test("erro do servidor aparece no campo e preserva os valores", async ({
  page,
}) => {
  await setup(page, "unidades");
  await page.route("**/api/v1/unidades", (route) =>
    route.fulfill({
      status: 400,
      json: {
        erro: {
          codigo: "VALIDACAO",
          mensagem: "Fuso inválido.",
          campos: ["fuso_horario"],
        },
      },
    }),
  );
  await page.goto("/cadastros/unidades");
  await page.getByRole("button", { name: "Cadastrar unidade" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Sala");
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.locator("#error-fuso_horario")).toHaveText(
    "Fuso inválido.",
  );
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Sala");
});
test("adoção seleciona hierarquia, confirma e trata conflito", async ({
  page,
}) => {
  await setup(page, "empresas");
  let attempt = 0;
  await page.route("**/api/v1/dispositivos-pendentes**", async (route) => {
    if (route.request().method() === "POST") {
      attempt++;
      expect(route.request().postDataJSON()).toEqual({
        ambiente_id: 5,
        sensor: "DHT11",
      });
      return route.fulfill(
        attempt === 1
          ? {
              status: 409,
              json: {
                erro: {
                  codigo: "CONCORRENCIA",
                  mensagem: "Tente novamente.",
                  campos: [],
                },
              },
            }
          : { status: 201, json: { dados: { id: 8, ativo: true } } },
      );
    }
    const destinations = route.request().url().includes("/destinos");
    return route.fulfill({
      json: {
        dados: destinations
          ? [
              {
                id: 5,
                nome: "Sala",
                empresa_nome: "Empresa",
                unidade_nome: "Bancada",
                setor_nome: "Testes",
              },
            ]
          : [
              {
                id: 3,
                device_id: "esp32-pendente",
                primeiro_contato_em: "2026-10-15T12:00:00Z",
                ultimo_contato_em: "2026-10-15T12:01:00Z",
                qtd_mensagens: 2,
                ultimo_payload: { temperatura: 22 },
                situacao: "pendente",
              },
            ],
        total: 1,
        pagina: 1,
        tamanho: 20,
      },
    });
  });
  await page.goto("/cadastros/pendentes");
  await page.getByRole("button", { name: "Adotar esp32-pendente" }).click();
  await page.getByLabel("Empresa de destino").selectOption("1");
  await page.getByLabel("Ambiente de destino").selectOption("5");
  await page.getByRole("button", { name: "Revisar adoção" }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Tente novamente.");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Placa adotada");
});
for (const width of [360, 1440])
  test(`cadastros responsivos ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, "ambientes");
    await page.goto("/cadastros/ambientes");
    await page.getByRole("button", { name: "Cadastrar ambiente" }).click();
    await expect(page.getByLabel("Setor", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`cadastros-${width}.png`),
      fullPage: true,
    });
  });
