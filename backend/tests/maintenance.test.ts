import { afterEach, expect, it, vi } from 'vitest';
import { createMaintenanceService, DAY, HOUR } from '../src/modules/maintenance/maintenance.service';
import type { MaintenanceRepository } from '../src/modules/maintenance/maintenance.repository';
import { startMaintenanceScheduler } from '../src/modules/maintenance/scheduler';
import { createLogger } from '../src/shared/logger';

afterEach(() => vi.useRealTimers());
it('recupera 48 horas completas e aplica retenções sem expurgar a hora de fronteira', async () => {
  const repository = { summarize: vi.fn(), markOffline: vi.fn(), purgeReadings: vi.fn(), cleanSessions: vi.fn() } as unknown as MaintenanceRepository;
  const now = new Date('2026-10-13T13:25:32.789Z');
  const service = createMaintenanceService(repository, () => now);
  await service.summarize(); await service.offline(); await service.purge(); await service.sessions();
  expect(repository.summarize).toHaveBeenCalledWith(new Date('2026-10-11T13:00:00Z'), new Date('2026-10-13T13:00:00Z'));
  expect(repository.markOffline).toHaveBeenCalledWith(now);
  expect(repository.purgeReadings).toHaveBeenCalledWith(new Date(Math.floor((+now - 90 * DAY) / HOUR) * HOUR), expect.any(Function));
  expect(repository.cleanSessions).toHaveBeenCalledWith(new Date(+now - 30 * DAY), expect.any(Function));
});
it('agenda offline por minuto e exclusões às 03:00/03:30 na Bahia; parada impede novas execuções', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T05:59:59Z'));
  const result = { skipped: false, affected: 0 };
  const service = { summarize: vi.fn().mockResolvedValue(result), offline: vi.fn().mockResolvedValue(result), purge: vi.fn().mockResolvedValue(result), sessions: vi.fn().mockResolvedValue(result) };
  const scheduler = startMaintenanceScheduler(service, createLogger('silent'));
  try {
    await vi.advanceTimersByTimeAsync(1500);
    expect(service.summarize).toHaveBeenCalledTimes(2);
    expect(service.offline).toHaveBeenCalledTimes(1);
    expect(service.purge).toHaveBeenCalledTimes(1);
    expect(service.sessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30 * 60000);
    expect(service.sessions).toHaveBeenCalledTimes(1);
  } finally { await scheduler.stop(); }
  const calls = service.offline.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120000);
  expect(service.offline).toHaveBeenCalledTimes(calls);
});
it('shutdown aguarda trabalho em andamento e sinaliza parada entre lotes', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T05:59:59Z'));
  let finish!: () => void;
  let continuing!: () => boolean;
  const service = { summarize: vi.fn().mockResolvedValue({ skipped: false, affected: 0 }), offline: vi.fn().mockResolvedValue({ skipped: false, affected: 0 }), sessions: vi.fn().mockResolvedValue({ skipped: false, affected: 0 }), purge: vi.fn(async (test: () => boolean) => { continuing = test; await new Promise<void>(resolve => { finish = resolve; }); return { skipped: false, affected: 0 }; }) };
  const scheduler = startMaintenanceScheduler(service, createLogger('silent'));
  await vi.advanceTimersByTimeAsync(1500);
  expect(continuing()).toBe(true);
  const stop = scheduler.stop(); let stopped = false; void stop.then(() => { stopped = true; });
  await Promise.resolve(); expect(stopped).toBe(false); expect(continuing()).toBe(false);
  finish(); await stop; expect(stopped).toBe(true);
});
it('falha não derruba o agendador nem expõe erro SQL; próxima hora tenta novamente', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T05:59:59Z'));
  const result = { skipped: false, affected: 0 };
  const service = { summarize: vi.fn().mockRejectedValueOnce(new Error('password=private')).mockResolvedValue(result), offline: vi.fn().mockResolvedValue(result), purge: vi.fn().mockResolvedValue(result), sessions: vi.fn().mockResolvedValue(result) };
  const logger = createLogger('silent'); const error = vi.spyOn(logger,'error');
  const scheduler = startMaintenanceScheduler(service,logger);
  try {
    await vi.advanceTimersByTimeAsync(1500);
    expect(service.summarize).toHaveBeenCalledTimes(2); expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain('private');
  } finally { await scheduler.stop(); }
});
