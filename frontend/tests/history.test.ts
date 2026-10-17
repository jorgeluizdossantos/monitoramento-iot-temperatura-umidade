import { expect, it } from "vitest";
import {
  chartBuckets,
  day,
  localInput,
  period,
  toUtc,
  historySchema,
  type Hour,
} from "../src/features/ambiente/model";
it("converte Bahia para UTC sem depender do fuso do navegador e rejeita datas inexistentes", () => {
  expect(toUtc("2026-10-17T10:30")).toBe("2026-10-17T13:30:00.000Z");
  expect(localInput(Date.parse("2026-10-17T13:30:00Z"))).toBe(
    "2026-10-17T10:30",
  );
  expect(() => toUtc("2026-02-30T12:00")).toThrow();
});
it("valida limites, intervalo invertido e horas completas para resumos antigos", () => {
  expect(period("2026-01-01T00:00", "2026-02-01T00:00", 31)).toBeTruthy();
  expect(() => period("2026-01-01T00:00", "2026-02-01T00:01", 31)).toThrow(
    "31 dias",
  );
  expect(() => period("2026-01-01T00:00", "2026-01-01T00:00", 31)).toThrow();
  expect(() =>
    period(
      "2026-01-01T00:01",
      "2026-06-01T00:00",
      366,
      Date.parse("2026-10-17"),
    ),
  ).toThrow("horas completas");
});
it("preserva IDs grandes e transforma decimais sem perda de identidade", () => {
  const row = {
    id: "18446744073709551615",
    dispositivo_id: 1,
    medido_em: "2026-01-01T00:00:00Z",
    recebido_em: "2026-01-01T00:00:00Z",
    temperatura_c: "20.5",
    umidade_pct: "50.0",
  };
  const value = historySchema.parse({
    dados: [row],
    total: 1,
    pagina: 1,
    tamanho: 20,
  });
  expect(value.dados[0].id).toBe(row.id);
  expect(value.dados[0].temperatura_c).toBe(20.5);
});
it("limita gráfico anual a 240 intervalos e preserva extremos, médias ponderadas e lacunas", () => {
  const start = Date.parse("2026-01-01T00:00:00Z");
  const range = {
    de: new Date(start).toISOString(),
    ate: new Date(start + 366 * day).toISOString(),
  };
  const row: Hour = {
    hora_ref: range.de,
    qtd_leituras: 1,
    temp_media: 10,
    temp_min: 0,
    temp_max: 20,
    umid_media: 50,
    umid_min: 40,
    umid_max: 60,
  };
  const result = chartBuckets(
    [
      row,
      {
        ...row,
        hora_ref: new Date(start + 3600000).toISOString(),
        qtd_leituras: 3,
        temp_media: 30,
        temp_max: 99,
      },
    ],
    range,
  );
  expect(result.dados.length).toBeLessThanOrEqual(240);
  expect(result.dados[0]).toMatchObject({
    count: 4,
    temp_media: 25,
    temp_min: 0,
    temp_max: 99,
  });
  expect(result.dados[1].temp_media).toBeNull();
});
