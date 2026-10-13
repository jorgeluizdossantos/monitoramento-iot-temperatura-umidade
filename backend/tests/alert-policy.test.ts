import { expect, it } from 'vitest';
import { advanceEpisode, classifyReading } from '../src/modules/telemetria/alert-policy';

it('faixa inclusiva, tolerância inclusiva e crítico além da tolerância', () => {
  const range = { min: 18, max: 26, tolerance: 2 };
  for (const value of [18, 20, 26]) expect(classifyReading(value, range)).toBeNull();
  expect(classifyReading(28, range)).toMatchObject({ direction: 'acima', severity: 'atencao', limit: 26 });
  expect(classifyReading(28.1, range)).toMatchObject({ severity: 'critico' });
  expect(classifyReading(16, range)).toMatchObject({ direction: 'abaixo', severity: 'atencao', limit: 18 });
  expect(classifyReading(15.9, range)).toMatchObject({ severity: 'critico' });
});
it('limites ausentes não inventam violações; tolerância nula torna violação crítica', () => {
  expect(classifyReading(100, { min: null, max: null, tolerance: null })).toBeNull();
  expect(classifyReading(-10, { min: null, max: 30, tolerance: 2 })).toBeNull();
  expect(classifyReading(100, { min: 18, max: null, tolerance: 2 })).toBeNull();
  expect(classifyReading(26.1, { min: 18, max: 26, tolerance: null })).toMatchObject({ severity: 'critico' });
  expect(classifyReading(26.3, { min: 18, max: 26.1, tolerance: 0.2 })).toMatchObject({ severity: 'atencao' });
});
it('episódio conserva a maior severidade e o pior valor', () => {
  expect(advanceEpisode({ severity: 'critico', extreme: 32 }, { direction: 'acima', severity: 'atencao', value: 27, limit: 26 })).toEqual({ severity: 'critico', extreme: 32 });
  expect(advanceEpisode({ severity: 'atencao', extreme: 17 }, { direction: 'abaixo', severity: 'critico', value: 14, limit: 18 })).toEqual({ severity: 'critico', extreme: 14 });
});
