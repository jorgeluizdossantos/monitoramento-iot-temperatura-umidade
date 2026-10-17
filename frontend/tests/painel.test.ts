import { afterEach, expect, it, vi } from "vitest";
import { connectPanel } from "../src/features/painel/realtime";
import {
  current,
  groupRooms,
  number,
  panelSchema,
  roomState,
} from "../src/features/painel/model";
const row = {
  ambiente_id: 1,
  empresa_id: 1,
  setor_id: 1,
  ambiente: "Sala",
  unidade_id: 1,
  unidade: "Unidade",
  setor: "Setor",
  dispositivo_id: 1,
  device_id: "esp32",
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
afterEach(() => vi.useRealTimers());
it("normaliza DECIMAL MySQL sem transformar null em zero e agrupa múltiplas placas", () => {
  const parsed = panelSchema.parse({
    dados: [row, { ...row, dispositivo_id: 2, estado: "critico" }],
  });
  expect(parsed.dados[0].temperatura_c).toBe(22.5);
  expect(parsed.dados[0].umid_min_ideal).toBeNull();
  expect(groupRooms(parsed.dados)).toHaveLength(1);
  expect(roomState(parsed.dados)).toBe("critico");
  expect(number(22.5)).toBe("22,5");
});
it("não apresenta valores antigos ou manutenção como leitura atual", () => {
  const parsed = panelSchema.parse({
    dados: [
      { ...row, status_conexao: "offline", estado: "critico" },
      { ...row, dispositivo_id: 2, em_manutencao: 1 },
    ],
  });
  expect(parsed.dados.every((r) => !current(r))).toBe(true);
  expect(roomState(parsed.dados)).toBe("sem_dados");
});
it("rejeita contratos inesperados antes de renderizar", () => {
  expect(
    panelSchema.safeParse({ dados: [{ ...row, temperatura_c: "inválido" }] })
      .success,
  ).toBe(false);
});
it("agrupa avisos, usa fallback de 30s e fecha conexão/timers ao desmontar", async () => {
  vi.useFakeTimers();
  const source = new EventTarget();
  const close = vi.fn();
  const events = new EventTarget();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const status = vi.fn();
  const stop = connectPanel(
    refresh,
    status,
    () => ({ addEventListener: source.addEventListener.bind(source), close }),
    events,
  );
  source.dispatchEvent(new Event("open"));
  for (let i = 0; i < 20; i++) source.dispatchEvent(new Event("atualizar"));
  await vi.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(1);
  source.dispatchEvent(new Event("error"));
  await vi.advanceTimersByTimeAsync(150);
  expect(status).toHaveBeenLastCalledWith("reconnecting");
  await vi.advanceTimersByTimeAsync(30000);
  expect(refresh).toHaveBeenCalledTimes(3);
  source.dispatchEvent(new Event("open"));
  await vi.advanceTimersByTimeAsync(150);
  const count = refresh.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30000);
  expect(refresh).toHaveBeenCalledTimes(count);
  stop();
  events.dispatchEvent(new Event("online"));
  source.dispatchEvent(new Event("atualizar"));
  await vi.advanceTimersByTimeAsync(60000);
  expect(close).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledTimes(count);
});
it("não perde aviso recebido durante consulta em andamento", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const refresh = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    )
    .mockResolvedValue(undefined);
  const source = new EventTarget();
  const stop = connectPanel(
    refresh,
    () => {},
    () => ({
      addEventListener: source.addEventListener.bind(source),
      close: () => {},
    }),
    new EventTarget(),
  );
  source.dispatchEvent(new Event("atualizar"));
  await vi.advanceTimersByTimeAsync(150);
  source.dispatchEvent(new Event("atualizar"));
  finish();
  await vi.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});

it("reabre stream fechado e substitui conexão ao recuperar a rede sem sobreposição", async () => {
  vi.useFakeTimers();
  const events = new EventTarget();
  const sources: EventTarget[] = [];
  const closures = vi.fn();
  const factory = vi.fn(() => {
    const source = new EventTarget();
    sources.push(source);
    return {
      readyState: 2,
      addEventListener: source.addEventListener.bind(source),
      close: closures,
    };
  });
  const stop = connectPanel(
    async () => {},
    () => {},
    factory,
    events,
  );
  sources[0].dispatchEvent(new Event("error"));
  sources[0].dispatchEvent(new Event("open"));
  sources[0].dispatchEvent(new Event("error"));
  await vi.advanceTimersByTimeAsync(3000);
  expect(factory).toHaveBeenCalledTimes(2);
  expect(closures).toHaveBeenCalledTimes(1);
  events.dispatchEvent(new Event("online"));
  expect(factory).toHaveBeenCalledTimes(3);
  expect(closures).toHaveBeenCalledTimes(2);
  stop();
});
