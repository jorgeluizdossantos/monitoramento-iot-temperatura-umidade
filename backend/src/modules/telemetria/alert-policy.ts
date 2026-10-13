export type Severity = 'atencao' | 'critico';
export interface Range { min: number | null; max: number | null; tolerance: number | null }
export interface Violation { direction: 'acima' | 'abaixo'; severity: Severity; limit: number; value: number }

/** Limites inclusivos: o valor exatamente no limite ainda é normal. */
export function classifyReading(value: number, range: Range): Violation | null {
  const direction = range.min !== null && value < range.min ? 'abaixo'
    : range.max !== null && value > range.max ? 'acima' : null;
  if (!direction) return null;
  const limit = direction === 'abaixo' ? range.min! : range.max!;
  // O schema guarda uma casa decimal. Comparar décimos evita erros de ponto flutuante.
  const distance = Math.abs(Math.round(value * 10) - Math.round(limit * 10));
  const severity = distance > Math.round((range.tolerance ?? 0) * 10) ? 'critico' : 'atencao';
  return { direction, severity, limit, value };
}

export function advanceEpisode(previous: { severity: Severity; extreme: number }, violation: Violation) {
  return {
    severity: previous.severity === 'critico' || violation.severity === 'critico' ? 'critico' as const : 'atencao' as const,
    extreme: violation.direction === 'acima' ? Math.max(previous.extreme, violation.value) : Math.min(previous.extreme, violation.value),
  };
}
