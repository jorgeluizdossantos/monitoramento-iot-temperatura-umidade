import { z } from "zod";
const decimal = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform(Number)
  .pipe(z.number().finite())
  .nullable();
export const readingSchema = z.object({
  ambiente_id: z.number().int().positive(),
  empresa_id: z.number().int().positive(),
  setor_id: z.number().int().positive(),
  ambiente: z.string(),
  unidade_id: z.number().int().positive(),
  unidade: z.string(),
  setor: z.string(),
  dispositivo_id: z.number().int().positive().nullable(),
  device_id: z.string().nullable(),
  status_conexao: z.enum(["online", "offline", "desconhecido"]).nullable(),
  em_manutencao: z
    .union([z.boolean(), z.literal(0), z.literal(1)])
    .nullable()
    .transform((v) => v === true || v === 1),
  ultima_leitura_em: z.string().datetime({ offset: true }).nullable(),
  temperatura_c: decimal,
  umidade_pct: decimal,
  estado: z.enum(["normal", "atencao", "critico", "sem_dados"]),
  temp_min_ideal: decimal,
  temp_max_ideal: decimal,
  umid_min_ideal: decimal,
  umid_max_ideal: decimal,
  temp_tolerancia: decimal,
  umid_tolerancia: decimal,
});
export const panelSchema = z.object({ dados: z.array(readingSchema) });
export type Reading = z.infer<typeof readingSchema>;
export type State = Reading["estado"];
export const labels: Record<State, string> = {
  normal: "Normal",
  atencao: "Atenção",
  critico: "Crítico",
  sem_dados: "Sem dados atuais",
};
export const current = (row: Reading) =>
  row.status_conexao === "online" &&
  !row.em_manutencao &&
  row.ultima_leitura_em !== null;
export const number = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Bahia",
      }).format(new Date(value))
    : "Nenhuma leitura recebida";
export function groupRooms(rows: Reading[]) {
  const groups = new Map<number, Reading[]>();
  for (const row of rows) {
    const group = groups.get(row.ambiente_id) ?? [];
    group.push(row);
    groups.set(row.ambiente_id, group);
  }
  return [...groups.values()];
}
export function roomState(rows: Reading[]): State {
  const states = rows.filter(current).map((r) => r.estado);
  return states.includes("critico")
    ? "critico"
    : states.includes("atencao")
      ? "atencao"
      : states.includes("normal")
        ? "normal"
        : "sem_dados";
}
