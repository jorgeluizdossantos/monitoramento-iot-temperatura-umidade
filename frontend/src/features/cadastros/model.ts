import { z } from "zod";
export const entities = [
  "empresas",
  "unidades",
  "setores",
  "ambientes",
  "dispositivos",
  "usuarios",
] as const;
export type Entity = (typeof entities)[number];
export type Row = {
  id: number;
  ativo: boolean;
  nome?: string | null;
  [key: string]: unknown;
};
const id = z.number().int().positive().max(4294967295);
const name = z.string().trim().min(1, "Informe o nome.").max(120);
const text = z.string().trim().max(255).nullable();
const decimal = (min: number, max: number) =>
  z
    .number()
    .finite()
    .min(min)
    .max(max)
    .refine(
      (v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-8,
      "Use no máximo uma casa decimal.",
    )
    .nullable();
const account = z.object({
  nome: name,
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255),
  senha: z.string().min(12, "Use de 12 a 128 caracteres.").max(128),
});
const schemas = {
  empresas: z.object({
    nome: name,
    cnpj: z
      .string()
      .regex(/^[0-9A-Z]{12}[0-9]{2}$/, "Informe 14 caracteres, sem pontuação.")
      .nullable(),
  }),
  unidades: z.object({
    nome: name,
    endereco: text,
    fuso_horario: z
      .string()
      .max(40)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("pt-BR", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Fuso inválido."),
  }),
  setores: z.object({ nome: name, unidade_id: id, descricao: text }),
  ambientes: z.object({
    nome: name,
    setor_id: id,
    descricao: text,
    temp_min_ideal: decimal(-50, 100),
    temp_max_ideal: decimal(-50, 100),
    umid_min_ideal: decimal(0, 100),
    umid_max_ideal: decimal(0, 100),
    temp_tolerancia: decimal(0, 99.9),
    umid_tolerancia: decimal(0, 99.9),
  }),
  usuarios: account.extend({
    perfil: z.enum(["administrador", "operador", "leitor"]),
  }),
  dispositivos: z.object({
    nome: name.nullable(),
    ambiente_id: id,
    device_id: z
      .string()
      .regex(
        /^[a-z0-9_-]{3,64}$/,
        "Use 3–64 letras minúsculas, números, _ ou -.",
      ),
    modelo_placa: z.string().trim().min(1).max(30),
    sensor: z.enum(["DHT11", "DHT22", "SHT31", "OUTRO"]),
    intervalo_leitura_seg: z.number().int().min(2).max(3600),
    offline_apos_seg: z.number().int().min(10).max(86400),
    em_manutencao: z.boolean(),
  }),
};
export const rowSchema = z
  .object({ id, ativo: z.boolean(), nome: z.string().nullable().optional() })
  .passthrough();
export const pageSchema = z.object({
  dados: z.array(rowSchema),
  total: z.number().int().nonnegative(),
  pagina: id,
  tamanho: id,
});
export const resultSchema = z.object({ dados: rowSchema });
export type Field = {
  key: string;
  label: string;
  type?: "number" | "password" | "email" | "checkbox";
  options?: string[];
  reference?: Entity;
  nullable?: boolean;
  initial?: unknown;
};
const named: Field = { key: "nome", label: "Nome" };
const desc: Field = { key: "descricao", label: "Descrição", nullable: true };
export const config: Record<
  Entity,
  { title: string; singular: string; fields: Field[] }
> = {
  empresas: {
    title: "Empresas",
    singular: "empresa",
    fields: [named, { key: "cnpj", label: "CNPJ", nullable: true }],
  },
  unidades: {
    title: "Unidades",
    singular: "unidade",
    fields: [
      named,
      { key: "endereco", label: "Endereço", nullable: true },
      { key: "fuso_horario", label: "Fuso horário", initial: "America/Bahia" },
    ],
  },
  setores: {
    title: "Setores",
    singular: "setor",
    fields: [
      named,
      {
        key: "unidade_id",
        label: "Unidade",
        type: "number",
        reference: "unidades",
      },
      desc,
    ],
  },
  ambientes: {
    title: "Ambientes",
    singular: "ambiente",
    fields: [
      named,
      { key: "setor_id", label: "Setor", type: "number", reference: "setores" },
      desc,
      ...[
        ["temp_min_ideal", "Temperatura mínima (°C)"],
        ["temp_max_ideal", "Temperatura máxima (°C)"],
        ["umid_min_ideal", "Umidade mínima (%)"],
        ["umid_max_ideal", "Umidade máxima (%)"],
        ["temp_tolerancia", "Tolerância de temperatura (°C)"],
        ["umid_tolerancia", "Tolerância de umidade (%)"],
      ].map(([key, label]) => ({
        key,
        label,
        type: "number" as const,
        nullable: true,
      })),
    ],
  },
  dispositivos: {
    title: "Dispositivos",
    singular: "dispositivo",
    fields: [
      { ...named, nullable: true },
      {
        key: "ambiente_id",
        label: "Ambiente",
        type: "number",
        reference: "ambientes",
      },
      { key: "device_id", label: "Identificador MQTT (device_id)" },
      { key: "modelo_placa", label: "Modelo da placa", initial: "ESP32" },
      {
        key: "sensor",
        label: "Sensor",
        options: ["DHT11", "DHT22", "SHT31", "OUTRO"],
        initial: "DHT11",
      },
      {
        key: "intervalo_leitura_seg",
        label: "Intervalo de leitura (s)",
        type: "number",
        initial: 30,
      },
      {
        key: "offline_apos_seg",
        label: "Tempo para offline (s)",
        type: "number",
        initial: 120,
      },
      {
        key: "em_manutencao",
        label: "Em manutenção",
        type: "checkbox",
        initial: false,
      },
    ],
  },
  usuarios: {
    title: "Usuários",
    singular: "usuário",
    fields: [
      named,
      { key: "email", label: "E-mail", type: "email" },
      { key: "senha", label: "Senha", type: "password" },
      {
        key: "perfil",
        label: "Perfil",
        options: ["administrador", "operador", "leitor"],
        initial: "leitor",
      },
    ],
  },
};
export const adminFields: Field[] = [
  { key: "administrador.nome", label: "Nome do administrador inicial" },
  {
    key: "administrador.email",
    label: "E-mail do administrador inicial",
    type: "email",
  },
  {
    key: "administrador.senha",
    label: "Senha do administrador inicial",
    type: "password",
  },
];
export function formSchema(entity: Entity, edit: boolean) {
  const base: z.ZodType<Record<string, unknown>> =
    entity === "empresas" && !edit
      ? schemas.empresas.extend({ administrador: account })
      : edit
        ? schemas[entity].partial()
        : schemas[entity];
  return base.superRefine((value, ctx) => {
    const data = value as Record<string, unknown>;
    for (const prefix of ["temp", "umid"]) {
      const min = data[`${prefix}_min_ideal`],
        max = data[`${prefix}_max_ideal`];
      if (typeof min === "number" && typeof max === "number" && min > max)
        ctx.addIssue({
          code: "custom",
          path: [`${prefix}_min_ideal`],
          message: "O mínimo não pode superar o máximo.",
        });
    }
  });
}
export function defaults(entity: Entity, row?: Row) {
  return Object.fromEntries(
    [
      ...config[entity].fields,
      ...(entity === "empresas" && !row ? adminFields : []),
    ].map((f) => [
      f.key,
      f.type === "password"
        ? ""
        : (row?.[f.key] ?? f.initial ?? (f.type === "checkbox" ? false : "")),
    ]),
  );
}
// Formulário usa strings; API recebe números, booleanos e null. Edição envia só alterações.
export function payload(
  entity: Entity,
  values: Record<string, unknown>,
  original?: Row,
) {
  const result: Record<string, unknown> = {};
  for (const field of config[entity].fields) {
    const raw = values[field.key];
    if (original && field.type === "password" && !raw) continue;
    const value =
      field.nullable && raw === ""
        ? null
        : field.type === "number"
          ? Number(raw)
          : raw;
    if (!original || value !== original[field.key]) result[field.key] = value;
  }
  if (entity === "empresas" && !original)
    result.administrador = Object.fromEntries(
      adminFields.map((f) => [f.key.split(".")[1], values[f.key]]),
    );
  return result;
}
