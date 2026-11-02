/**
 * Number and date formatting (MO-208, MO-518). Money formats by detected
 * currency: ZAR -> "R 1.84m", "R 420k".
 */

const SYMBOLS: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', NGN: '₦', KES: 'KSh', INR: '₹' };

export function currencyFromName(name: string): string | undefined {
  const m = /_(zar|usd|eur|gbp|aud|cad|ngn|kes|inr)(_cents)?$/i.exec(name);
  return m ? m[1]!.toUpperCase() : undefined;
}

export function formatCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${trim((a / 1e9).toFixed(2))}bn`;
  if (a >= 1e6) return `${sign}${trim((a / 1e6).toFixed(2))}m`;
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`;
  return `${sign}${Math.round(a)}`;
}

function trim(s: string): string {
  return s.replace(/\.?0+$/, '');
}

export function formatMoney(n: number | null | undefined, currency?: string, opts: { compact?: boolean; locale?: string } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const compact = opts.compact ?? true;
  const sym = currency ? (SYMBOLS[currency] ?? currency) : '';
  if (compact) return sym ? `${sym} ${formatCompact(n)}` : formatCompact(n);
  const body = new Intl.NumberFormat(opts.locale ?? 'en-ZA', { maximumFractionDigits: 0 }).format(n);
  return sym ? `${sym} ${body}` : body;
}

export function formatNumber(n: number | null | undefined, locale = 'en-ZA'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
}

export function formatDays(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${Math.round(n)} d`;
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export function formatDate(v: unknown, locale = 'en-ZA'): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function formatMonth(v: unknown, locale = 'en-ZA'): string {
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
}

/** "Nice" axis ticks: 0, 250k, 500k... */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Formats a value by its semantic type. */
export function formatValue(v: unknown, semantic: string, currency?: string): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (semantic) {
    case 'money':
      return formatMoney(Number(v), currency);
    case 'count':
    case 'number':
      return formatNumber(Number(v));
    case 'percent':
      return formatPercent(Number(v));
    case 'date':
    case 'datetime':
      return formatDate(v);
    case 'boolean':
      return v ? 'Yes' : 'No';
    default:
      return String(v);
  }
}
