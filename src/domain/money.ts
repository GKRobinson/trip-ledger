/**
 * Money is stored as integer cents (hundredths of the currency unit), so
 * adding up receipts never drifts the way 0.1 + 0.2 does in floating point.
 * The currency is only a label; nothing is ever converted.
 */
export type Cents = number;

/** 10 billion units. Keeps every sum of amounts a safe integer. */
export const MAX_CENTS = 1_000_000_000_000;

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_CENTS;
}

export type ParsedAmount = { ok: true; cents: Cents } | { ok: false; error: string };

const AMOUNT_RE = /^(-)?(\d*)(?:\.(\d*))?$/;

/**
 * Reads what someone typed into an amount box. Accepts "45.2", "45.20",
 * ".5", "-12" and a comma decimal mark ("12,50") from comma-locale keypads.
 * Rejects anything ambiguous, such as "12,500" or "1.234", rather than guess.
 */
export function parseAmount(text: string): ParsedAmount {
  let s = text.replace(/\s+/g, '').replace(/^−/, '-');
  if (s === '') return { ok: false, error: 'Enter an amount.' };
  const typed = s;
  if (!s.includes('.') && (s.match(/,/g) ?? []).length === 1) s = s.replace(',', '.');
  const m = AMOUNT_RE.exec(s);
  const whole = m?.[2] ?? '';
  const frac = m?.[3] ?? '';
  if (typed.includes(',') && (!m || frac.length > 2)) {
    return { ok: false, error: `Leave out the thousands separator, e.g. ${typed.replace(/,/g, '')}` };
  }
  if (!m || (whole === '' && frac === '')) return { ok: false, error: 'Numbers only, e.g. 45.20' };
  if (frac.length > 2) return { ok: false, error: 'Use at most 2 decimal places.' };
  const cents = (Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))) * (m[1] ? -1 : 1);
  if (!isCents(cents)) return { ok: false, error: 'That amount is too large.' };
  return { ok: true, cents: cents === 0 ? 0 : cents };
}

/**
 * Display form with the device's digit grouping. `'auto'` shows decimals
 * only when there are any, so "45" stays "45" and "45.2" shows as "45.20".
 * Works on fractional cents too (per-day figures), rounding for display.
 */
export function formatMoney(cents: number, decimals: 0 | 2 | 'auto' = 'auto'): string {
  const d = decimals === 'auto' ? (Math.round(cents) % 100 === 0 ? 0 : 2) : decimals;
  let units = cents / 100;
  if (Math.abs(units) < 0.5 * 10 ** -d) units = 0; // never show "-0"
  return units.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Plain form for putting back into an input box: no grouping, "." decimal. */
export function centsToInput(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}
