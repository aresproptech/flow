export type EncargoHealthInput = {
  fechaInicio: string | null;
  fechaFin: string | null;
  pvpActual: number | string | null;
  pvpEstimado: number | string | null;
  rg15d: number;
  visitas30d: number;
};

export type EncargoHealthBreakdown = {
  health: number | null;
  scoreAvance: number;
  scoreDesvio: number;
  scoreRG: number;
  scoreVisitas: number;
  avancePct: number | null;
  desvioPct: number | null;
  diasRestantes: number | null;
};

function numericValue(value: number | string | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateDifferenceDays(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateProgress(fechaInicio: string | null, fechaFin: string | null, now: Date) {
  if (!fechaInicio || !fechaFin) return null;
  const start = new Date(fechaInicio);
  const end = new Date(fechaFin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;

  const elapsed = now.getTime() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function calculateDeviationPercentage(
  pvpActual: number | string | null,
  pvpEstimado: number | string | null
) {
  const actual = numericValue(pvpActual);
  const estimated = numericValue(pvpEstimado);
  if (actual === null || estimated === null || actual <= 0) return null;
  return ((actual - estimated) / actual) * 100;
}

export function calculateEncargoHealth(
  input: EncargoHealthInput,
  now = new Date()
): EncargoHealthBreakdown {
  const today = now.toISOString().slice(0, 10);
  const diasRestantes = dateDifferenceDays(today, input.fechaFin);
  const avancePct = calculateProgress(input.fechaInicio, input.fechaFin, now);
  const desvioPct = calculateDeviationPercentage(input.pvpActual, input.pvpEstimado);

  if (diasRestantes === null || diasRestantes <= 0) {
    return {
      health: 0,
      scoreAvance: 0,
      scoreDesvio: 0,
      scoreRG: 0,
      scoreVisitas: 0,
      avancePct,
      desvioPct,
      diasRestantes,
    };
  }

  const scoreAvance =
    avancePct === null ? 0 : avancePct <= 50 ? 2 : avancePct <= 70 ? 1 : 0;
  const scoreDesvio =
    desvioPct === null
      ? 0
      : desvioPct <= 7.5
        ? 4
        : desvioPct <= 10
          ? 3
          : avancePct !== null && avancePct < 25
            ? 3
            : 0;
  const scoreRG = input.rg15d > 1 ? 2 : input.rg15d > 0 ? 1 : 0;
  const scoreVisitas = input.visitas30d === 0 ? 0 : input.visitas30d <= 4 ? 1 : 2;

  return {
    health: scoreAvance + scoreDesvio + scoreRG + scoreVisitas,
    scoreAvance,
    scoreDesvio,
    scoreRG,
    scoreVisitas,
    avancePct,
    desvioPct,
    diasRestantes,
  };
}

export function countActivityDatesSince(
  dates: Array<string | null | undefined>,
  days: number,
  now = new Date()
) {
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - days);
  const cutoffValue = cutoff.toISOString().slice(0, 10);

  return dates.filter((value) => value && value.slice(0, 10) >= cutoffValue).length;
}

export function formatHealthScore(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}