import { expect, it } from "vitest";
import { defaults, payload, formSchema } from "../src/features/cadastros/model";
it("edição de usuário não reenvia senha vazia ou e-mail inalterado", () => {
  const row = {
    id: 1,
    ativo: true,
    nome: "Ana",
    email: "ana@example.com",
    perfil: "leitor",
  };
  expect(
    payload(
      "usuarios",
      { ...defaults("usuarios", row), nome: "Ana Silva" },
      row,
    ),
  ).toEqual({ nome: "Ana Silva" });
});
it("normaliza opcionais vazios e valida limites sem arredondar", () => {
  const data = payload("ambientes", {
    ...defaults("ambientes"),
    nome: "Sala",
    setor_id: "2",
    temp_min_ideal: "10.2",
    temp_max_ideal: "20",
  });
  expect(data.temp_min_ideal).toBe(10.2);
  expect(data.umid_min_ideal).toBeNull();
  expect(formSchema("ambientes", false).safeParse(data).success).toBe(true);
  expect(
    formSchema("ambientes", false).safeParse({ ...data, temp_min_ideal: 20.1 })
      .success,
  ).toBe(false);
  expect(
    formSchema("ambientes", false).safeParse({ ...data, temp_min_ideal: 10.22 })
      .success,
  ).toBe(false);
});
it("empresa exige administrador inicial; atualização não o altera", () => {
  const data = payload("empresas", {
    nome: "Empresa",
    cnpj: "",
    "administrador.nome": "Admin",
    "administrador.email": "admin@example.com",
    "administrador.senha": "senha-longa-123",
  });
  expect(formSchema("empresas", false).safeParse(data).success).toBe(true);
  expect(
    formSchema("empresas", false).safeParse({ nome: "Empresa", cnpj: null })
      .success,
  ).toBe(false);
  expect(
    formSchema("empresas", true).safeParse({ nome: "Outro" }).success,
  ).toBe(true);
});
