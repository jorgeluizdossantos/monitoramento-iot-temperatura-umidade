import { z } from "zod";
export const decimal = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .pipe(z.number().finite());
export const bigId = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative().safe().transform(String),
]);
const instant = z.string().datetime({ offset: true });
export const historySchema = z.object({
  dados: z.array(
    z.object({
      id: bigId,
      dispositivo_id: z.number(),
      medido_em: instant,
      recebido_em: instant,
      temperatura_c: decimal,
      umidade_pct: decimal,
    }),
  ),
  total: z.number().int().nonnegative(),
  pagina: z.number(),
  tamanho: z.number(),
});
export const hourSchema = z.object({
  hora_ref: instant,
  qtd_leituras: z.number().int().positive(),
  temp_media: decimal,
  temp_min: decimal,
  temp_max: decimal,
  umid_media: decimal,
  umid_min: decimal,
  umid_max: decimal,
});
export const seriesSchema = z.object({
  fonte: z.literal("leituras_brutas_e_resumos"),
  granularidade: z.literal("hora"),
  dados: z.array(hourSchema),
});
export type Hour = z.infer<typeof hourSchema>;
export type Period = { de: string; ate: string };
export const day = 86400000;
// Entradas são explicitamente Bahia (UTC−03), independentemente do fuso do computador.
export function localInput(time: number) {
  return new Date(time - 3 * 3600000).toISOString().slice(0, 16);
}
export function toUtc(value: string) {
  const time = Date.parse(`${value}:00-03:00`);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) ||
    !Number.isFinite(time) ||
    localInput(time) !== value
  )
    throw new Error("Informe uma data e hora válidas.");
  return new Date(time).toISOString();
}
export function period(
  de: string,
  ate: string,
  maxDays: number,
  now = Date.now(),
): Period {
  const result = { de: toUtc(de), ate: toUtc(ate) };
  const start = Date.parse(result.de),
    end = Date.parse(result.ate);
  if (end <= start || end - start > maxDays * day)
    throw new Error(
      `O fim deve ser posterior ao início; limite de ${maxDays} dias.`,
    );
  if (
    maxDays > 31 &&
    start < Math.floor((now - 90 * day) / 3600000) * 3600000 &&
    (start % 3600000 || end % 3600000)
  )
    throw new Error(
      "Períodos anteriores a 90 dias exigem início e fim em horas completas (minuto 00).",
    );
  return result;
}
export function recentPeriod(hours = 24): Period {
  const end = Math.floor(Date.now() / 60000) * 60000;
  return {
    de: new Date(end - hours * 3600000).toISOString(),
    ate: new Date(end).toISOString(),
  };
}
// Agrupa intervalos contíguos no tempo, preservando extremos e ponderando médias pela quantidade.
// Lacunas continuam como null: nunca ligar uma linha através de horas sem observações.
export function chartBuckets(rows: Hour[], range: Period, limit = 240) {
  const start = Math.floor(Date.parse(range.de) / 3600000) * 3600000,
    end = Date.parse(range.ate);
  const width = Math.max(
    3600000,
    Math.ceil((end - start) / limit / 3600000) * 3600000,
  );
  const buckets = Array.from(
    { length: Math.ceil((end - start) / width) },
    (_, i) => ({
      time: start + i * width,
      count: 0,
      temp_media: null as number | null,
      umid_media: null as number | null,
      temp_min: Infinity,
      temp_max: -Infinity,
      umid_min: Infinity,
      umid_max: -Infinity,
    }),
  );
  for (const row of rows) {
    const index = Math.floor(
        (Math.max(start, Date.parse(row.hora_ref)) - start) / width,
      ),
      bucket = buckets[index];
    if (!bucket) continue;
    const count = bucket.count + row.qtd_leituras;
    bucket.temp_media =
      ((bucket.temp_media ?? 0) * bucket.count +
        row.temp_media * row.qtd_leituras) /
      count;
    bucket.umid_media =
      ((bucket.umid_media ?? 0) * bucket.count +
        row.umid_media * row.qtd_leituras) /
      count;
    bucket.count = count;
    bucket.temp_min = Math.min(bucket.temp_min, row.temp_min);
    bucket.temp_max = Math.max(bucket.temp_max, row.temp_max);
    bucket.umid_min = Math.min(bucket.umid_min, row.umid_min);
    bucket.umid_max = Math.max(bucket.umid_max, row.umid_max);
  }
  return {
    width,
    dados: buckets.map((b) => ({
      ...b,
      temp_min: b.count ? b.temp_min : null,
      temp_max: b.count ? b.temp_max : null,
      umid_min: b.count ? b.umid_min : null,
      umid_max: b.count ? b.umid_max : null,
    })),
  };
}
