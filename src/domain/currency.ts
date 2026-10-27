import type { IsoDate } from './dates';
import type { Cents } from './money';
import type { ForeignCurrency, Pool, Rate } from './types';

/**
 * The rate for a date: the latest one dated on or before it. The earliest
 * rate also covers any days before it, so every amount can be converted.
 * Rates are entered by hand (what a withdrawal cost) — never fetched.
 */
export function rateOn(foreign: ForeignCurrency, date: IsoDate): Rate {
  let found = foreign.rates[0]!;
  for (const r of foreign.rates) if (r.date <= date) found = r;
  return found;
}

/** An amount of the pool's currency, in the trip's currency on `date`. */
export function toTripCents(pool: Pool, cents: Cents, date: IsoDate): Cents {
  if (!pool.foreign) return cents;
  const rate = rateOn(pool.foreign, date);
  return Math.round((cents * rate.paid) / rate.got);
}

/** An amount of the trip's currency, in the pool's currency at `rate`. */
export function toPoolCents(rate: Rate, tripCents: number): number {
  return (tripCents * rate.got) / rate.paid;
}

/**
 * "1 EUR = 1.64 AUD" or "1 AUD = 96.03 JPY" — whichever way round gives a
 * number of at least 1, which is how people quote rates.
 */
export function rateText(rate: Rate, poolCurrency: string, tripCurrency: string): string {
  const tripPerPool = rate.paid / rate.got;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumSignificantDigits: 4 });
  return tripPerPool >= 1
    ? `1 ${poolCurrency} = ${fmt(tripPerPool)} ${tripCurrency}`
    : `1 ${tripCurrency} = ${fmt(1 / tripPerPool)} ${poolCurrency}`;
}
